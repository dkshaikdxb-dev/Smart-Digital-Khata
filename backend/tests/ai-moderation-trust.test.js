// Tests for AI-assisted content moderation, PHASE 2 (batch MOD2): shop trust,
// post-publish spot checks and the honest metrics. NO real network is ever made
// — every classification path injects a FAKE client (exposing messages.create),
// exactly as the Phase-1 suite does, and the env gate is flipped IN-TEST only
// around the processor calls so the HTTP routes never enqueue (never touch
// Redis). Requires a real Postgres (DATABASE_URL) with the migrations applied
// (incl. 0070). Covers:
//   1. migration 0070 — the two tables + the five seeded settings.
//   2. scoreFor — the truth table an admin is supposed to be able to follow.
//   3. effectiveThresholds — trusted lowers, distrusted raises, the 0.75 HARD
//      FLOOR holds against an absurd bonus, trust disabled → plain policy.
//   4. the safety rails end to end — a trusted shop's 0.85 publishes where a
//      neutral shop's does not; a distrusted shop's 0.93 does not; 0.60 never
//      publishes for ANYONE; the AI never rejects; fail-open when the trust
//      lookup throws.
//   5. recordOutcome — upsert, and a human rejection AFTER an auto-approval.
//   6. sampling — forced on / forced off / pct 0 / pct 100.
//   7. spot checks — 'bad' takes the item down + decrements trust + audits with
//      the admin's id; 'ok' leaves it live; the perm gate.
//   8. aiStats — saved / overturned / precision (no ratio at small N) /
//      spot_checks / trust.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';
// Start UNCONFIGURED: with no credential and no model id the feature is inert,
// so nothing this suite does through HTTP can enqueue a job (there is no Redis
// in tests). Cleared by SHAPE rather than by name — no vendor or model product
// name belongs anywhere in this repository, tests included.
for (const key of Object.keys(process.env)) {
  if (key.endsWith('_API_KEY') || key.endsWith('_LLM_MODEL')) delete process.env[key];
}

const app = require('../src/app');
const { pool } = require('../src/config/db');
const settings = require('../src/config/settings');
const moderation = require('../src/services/moderation.service');
const trust = require('../src/utils/moderationTrust');

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const uniq = Date.now().toString().slice(-9);
const authHdr = (req, token) => req.set('Authorization', `Bearer ${token}`);
const adminToken = (id) => jwt.sign({ sub: id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '30d' });

// Test-only model id placeholder (NOT a real model name); the service reads it
// from the environment and stamps it on the verdict.
const TEST_MODEL = 'test-moderation-model';

const DAY = 86_400_000;

// Flip the service's config gate ON for the duration of one call. The service
// asks config/settings for its API key and its model id (it hardcodes neither),
// so the two reads are answered here with placeholders and everything else is
// passed through — which also keeps this file free of any vendor name. NO
// network is ever touched: every classification below is handed a fake client.
const realSettingsGet = settings.get;
async function configured(fn) {
  const spy = jest.spyOn(settings, 'get').mockImplementation((key) => {
    if (typeof key === 'string' && key.endsWith('_API_KEY')) return 'test-key-never-used';
    if (typeof key === 'string' && key.endsWith('_LLM_MODEL')) return TEST_MODEL;
    return realSettingsGet(key);
  });
  try { return await fn(); } finally { spy.mockRestore(); }
}

const verdictClient = (decision, confidence, reason = 'Looks like an ordinary shop photo.', categories = []) => ({
  messages: {
    create: async () => ({ content: [{ type: 'text', text: JSON.stringify({ decision, confidence, categories, reason }) }] }),
  },
});

let marketing; // ads:manage
let support; // no ads:*
let shopA; // the shop under test
let shopB; // a second shop, for the distrusted case
const imageIds = [];
const campaignIds = [];
const shopIds = [];
const userIds = [];

async function register(prefix, phoneSeed) {
  const res = await request(app).post('/api/auth/register').send({
    name: `${prefix} Owner`,
    email: `${prefix}_${uniq}@test.local`,
    phone: `+91${phoneSeed}${uniq}`,
    password: 'password123',
    shopName: `${prefix} Trust Shop`,
  });
  expect(res.status).toBe(201);
  shopIds.push(res.body.shop.id);
  userIds.push(res.body.user.id);
  return { token: res.body.token, user: res.body.user, shop: res.body.shop };
}

async function makeAdmin(key, role, phoneSeed) {
  const r = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role, admin_role)
     VALUES ($1,$2,$3,'x','admin',$4) RETURNING id`,
    [`MOD2 ${key}`, `mod2_${key}_${uniq}@test.local`, `+91${phoneSeed}${uniq}`, role]
  );
  userIds.push(r.rows[0].id);
  return { id: r.rows[0].id, token: adminToken(r.rows[0].id) };
}

async function setSetting(key, value) {
  await pool.query(
    `INSERT INTO platform_settings (key, value, updated_at) VALUES ($1,$2,NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, value]
  );
}

async function insertPendingImage(shopId, position = 0) {
  const r = await pool.query(
    `INSERT INTO shop_images (shop_id, position, mime, data, status)
     VALUES ($1, $2, 'image/webp', $3, 'pending_review') RETURNING id`,
    [shopId, position, PNG_1x1]
  );
  imageIds.push(r.rows[0].id);
  return r.rows[0].id;
}

async function insertPendingCampaign(shopId, ownerId, offer = 'Fresh stock daily') {
  const r = await pool.query(
    `INSERT INTO ad_campaigns
       (style, title, offer_text, subtitle, glyph, advertiser, link_type, link_shop_id,
        status, self_serve, credits_spent_paise, created_by)
     VALUES ('shop', 'Trust Shop', $1, 'Visit us', '🏪', 'Trust Shop', 'shop', $2, 'pending_review', true, 0, $3)
     RETURNING id`,
    [offer, shopId, ownerId]
  );
  campaignIds.push(r.rows[0].id);
  return r.rows[0].id;
}

const imageRow = async (id) => (await pool.query('SELECT status, ai_flagged, ai_verdict FROM shop_images WHERE id = $1', [id])).rows[0];
const campaignRow = async (id) => (await pool.query('SELECT status, ai_flagged FROM ad_campaigns WHERE id = $1', [id])).rows[0];
const trustRow = async (shopId) => (await pool.query('SELECT approved_count, rejected_count, last_rejected_at, score FROM shop_moderation_trust WHERE shop_id = $1', [shopId])).rows[0] || null;
const spotChecksFor = async (shopId) => (await pool.query(
  'SELECT id, kind, target_id, status, reviewed_by, note, ai_verdict FROM moderation_spot_checks WHERE shop_id = $1 ORDER BY created_at',
  [shopId]
)).rows;
const auditsForImage = async (id) => (await pool.query(
  "SELECT action, admin_user_id, metadata FROM moderation_actions WHERE metadata->>'image_id' = $1 ORDER BY created_at",
  [id]
)).rows;

// Force the shop's stored counters to a known history without replaying every
// decision (the counters themselves are exercised by the recordOutcome tests).
async function seedTrust(shopId, { approved, rejected, rejectedDaysAgo }) {
  const last = rejectedDaysAgo == null ? null : new Date(Date.now() - rejectedDaysAgo * DAY).toISOString();
  const score = trust.scoreFor({ approved_count: approved, rejected_count: rejected, last_rejected_at: last });
  await pool.query(
    `INSERT INTO shop_moderation_trust (shop_id, approved_count, rejected_count, last_rejected_at, score, updated_at)
     VALUES ($1,$2,$3,$4,$5,NOW())
     ON CONFLICT (shop_id) DO UPDATE SET approved_count = $2, rejected_count = $3,
       last_rejected_at = $4, score = $5, updated_at = NOW()`,
    [shopId, approved, rejected, last, score]
  );
  return score;
}

const clearTrust = (shopId) => pool.query('DELETE FROM shop_moderation_trust WHERE shop_id = $1', [shopId]);

beforeAll(async () => {
  await setSetting('ai_moderation_enabled', 'true');
  await setSetting('ai_moderation_auto_approve_min', '0.90');
  await setSetting('ai_moderation_hold_min', '0.90');
  await setSetting('ai_moderation_trust_enabled', 'true');
  await setSetting('ai_moderation_trust_min_items', '5');
  await setSetting('ai_moderation_trust_bonus', '0.05');
  await setSetting('ai_moderation_distrust_penalty', '0.10');
  // Sampling OFF by default so the policy tests are not perturbed; the sampling
  // describe() turns it on explicitly.
  await setSetting('ai_moderation_spot_check_pct', '0');
  marketing = await makeAdmin('mkt', 'marketing', '61');
  support = await makeAdmin('sup', 'support', '62');
  shopA = await register('Mod2A', '63');
  shopB = await register('Mod2B', '64');
  await pool.query('UPDATE shops SET slides_auto_publish = false, is_listed = true WHERE id = ANY($1)', [shopIds]);
});

afterEach(() => {
  // Never leave a forced sampler behind for the next test.
  trust.setSampler(null);
});

afterAll(async () => {
  await setSetting('ai_moderation_enabled', 'true');
  await setSetting('ai_moderation_auto_approve_min', '0.90');
  await setSetting('ai_moderation_hold_min', '0.90');
  await setSetting('ai_moderation_trust_enabled', 'true');
  await setSetting('ai_moderation_trust_min_items', '5');
  await setSetting('ai_moderation_trust_bonus', '0.05');
  await setSetting('ai_moderation_distrust_penalty', '0.10');
  await setSetting('ai_moderation_spot_check_pct', '10');
  if (imageIds.length) {
    await pool.query("DELETE FROM moderation_actions WHERE metadata->>'image_id' = ANY($1::text[])", [imageIds]);
  }
  await pool.query('DELETE FROM moderation_actions WHERE target_id = ANY($1) OR admin_user_id = ANY($2)',
    [[...campaignIds, ...shopIds], userIds]);
  await pool.query('DELETE FROM ad_campaigns WHERE link_shop_id = ANY($1)', [shopIds]);
  await pool.query('DELETE FROM shops WHERE id = ANY($1)', [shopIds]); // images + trust + spot checks cascade
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [userIds]);
  await pool.end();
});

// ---------------------------------------------------------------------------
// 1. migration 0070
// ---------------------------------------------------------------------------
describe('migration 0070 — schema + settings', () => {
  test('shop_moderation_trust and moderation_spot_checks exist with the documented shape', async () => {
    const t = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'shop_moderation_trust' ORDER BY column_name`
    );
    expect(t.rows.map((r) => r.column_name)).toEqual(
      ['approved_count', 'last_rejected_at', 'rejected_count', 'score', 'shop_id', 'updated_at']
    );
    const sc = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'moderation_spot_checks' ORDER BY column_name`
    );
    expect(sc.rows.map((r) => r.column_name)).toEqual(
      ['ai_verdict', 'created_at', 'id', 'kind', 'note', 'reviewed_at', 'reviewed_by', 'shop_id', 'status', 'target_id']
    );
    // The UNIQUE (kind, target_id) that makes sampling idempotent.
    const uq = await pool.query(
      `SELECT COUNT(*)::int AS n FROM pg_indexes
        WHERE tablename = 'moderation_spot_checks' AND indexdef ILIKE '%UNIQUE%(kind, target_id)%'`
    );
    expect(uq.rows[0].n).toBe(1);
  });

  test('the five trust settings are seeded', async () => {
    const s = await pool.query(
      `SELECT key FROM platform_settings WHERE key IN
       ('ai_moderation_trust_enabled','ai_moderation_trust_min_items','ai_moderation_trust_bonus',
        'ai_moderation_distrust_penalty','ai_moderation_spot_check_pct')`
    );
    expect(s.rows.length).toBe(5);
  });

  test('no shop was backfilled — every shop starts neutral', async () => {
    for (const id of shopIds) expect(await trustRow(id)).toBeNull();
    expect(trust.scoreFor(null)).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// 2. scoreFor — the truth table (pure, no database)
// ---------------------------------------------------------------------------
describe('scoreFor — the explainable formula', () => {
  test('no history → exactly 0.5 (neutral)', () => {
    expect(trust.scoreFor({ approved_count: 0, rejected_count: 0, last_rejected_at: null })).toBe(0.5);
    expect(trust.scoreFor(undefined)).toBe(0.5);
    expect(trust.scoreFor({})).toBe(0.5);
  });

  test('a clean run scores high, and one approval alone does NOT', () => {
    expect(trust.scoreFor({ approved_count: 1, rejected_count: 0 })).toBeCloseTo(2 / 3, 3);
    const many = trust.scoreFor({ approved_count: 20, rejected_count: 0 });
    expect(many).toBeGreaterThan(trust.TRUSTED_SCORE);
    expect(many).toBeCloseTo(21 / 22, 3);
  });

  test('one rejection in a long clean run dips the score without sinking it', () => {
    const clean = trust.scoreFor({ approved_count: 20, rejected_count: 0 });
    const old = new Date(Date.now() - 365 * DAY).toISOString();
    const dipped = trust.scoreFor({ approved_count: 20, rejected_count: 1, last_rejected_at: old });
    expect(dipped).toBeLessThan(clean);
    expect(dipped).toBeGreaterThan(trust.TRUSTED_SCORE);
  });

  test('a RECENT rejection hurts more than an old one', () => {
    const row = { approved_count: 20, rejected_count: 1 };
    const fresh = trust.scoreFor({ ...row, last_rejected_at: new Date(Date.now() - 1 * DAY).toISOString() });
    const middling = trust.scoreFor({ ...row, last_rejected_at: new Date(Date.now() - 45 * DAY).toISOString() });
    const old = trust.scoreFor({ ...row, last_rejected_at: new Date(Date.now() - 200 * DAY).toISOString() });
    expect(fresh).toBeLessThan(middling);
    expect(middling).toBeLessThan(old);
    // The penalty is gone entirely once the window has passed.
    expect(old).toBe(trust.scoreFor({ ...row, last_rejected_at: null }));
    // And a fresh rejection is enough to drop a 20-clean shop out of trusted.
    expect(fresh).toBeLessThan(trust.TRUSTED_SCORE);
  });

  test('a shop with only a fresh rejection is distrusted; garbage input never throws', () => {
    const bad = trust.scoreFor({ approved_count: 0, rejected_count: 1, last_rejected_at: new Date().toISOString() });
    expect(bad).toBeLessThan(trust.DISTRUSTED_SCORE);
    expect(trust.scoreFor({ approved_count: 'x', rejected_count: null, last_rejected_at: 'not a date' })).toBe(0.5);
    expect(trust.scoreFor({ approved_count: -5, rejected_count: -5 })).toBe(0.5);
  });

  test('counts below min_items do not confer trust (bandFor)', () => {
    const cfg = { ...trust.TRUST_DEFAULTS, min_items: 5 };
    // Score is high enough, history is not long enough.
    const short = { approved_count: 3, rejected_count: 0, score: trust.scoreFor({ approved_count: 3, rejected_count: 0 }) };
    expect(trust.bandFor({ ...short, score: 0.95 }, cfg)).toBe('neutral');
    expect(trust.bandFor({ approved_count: 20, rejected_count: 0, score: 0.95 }, cfg)).toBe('trusted');
    // Distrust has NO min_items guard — one bad item is enough to earn a look.
    expect(trust.bandFor({ approved_count: 0, rejected_count: 1, score: 0.03 }, cfg)).toBe('distrusted');
  });
});

// ---------------------------------------------------------------------------
// 3. effectiveThresholds — the bar, and the floor under it (pure)
// ---------------------------------------------------------------------------
describe('effectiveThresholds — trust bends the bar, the floor holds it', () => {
  const policy = { auto_approve_min: 0.9, hold_min: 0.9 };
  const cfg = { enabled: true, min_items: 5, bonus: 0.05, penalty: 0.1, spot_check_pct: 0 };
  const trusted = { approved_count: 20, rejected_count: 0, score: 0.955 };
  const distrusted = { approved_count: 0, rejected_count: 1, score: 0.03 };
  const neutral = { approved_count: 0, rejected_count: 0, score: 0.5 };

  test('a trusted shop gets a LOWER auto-approve bar', () => {
    const t = trust.effectiveThresholds(policy, trusted, cfg);
    expect(t.band).toBe('trusted');
    expect(t.auto_approve_min).toBe(0.85);
    expect(t.hold_min).toBe(0.9); // a trusted shop is never harder to flag
  });

  test('a distrusted shop gets a HIGHER auto-approve bar and a LOWER hold bar', () => {
    const t = trust.effectiveThresholds(policy, distrusted, cfg);
    expect(t.band).toBe('distrusted');
    expect(t.auto_approve_min).toBe(1);
    expect(t.hold_min).toBe(0.8);
  });

  test('a neutral shop, and a shop with no row at all, get the plain policy bars', () => {
    for (const row of [neutral, null, undefined]) {
      const t = trust.effectiveThresholds(policy, row, cfg);
      expect(t.band).toBe('neutral');
      expect(t.auto_approve_min).toBe(0.9);
      expect(t.hold_min).toBe(0.9);
    }
  });

  test('SAFETY RAIL — the 0.75 hard floor holds against an absurd bonus', () => {
    const absurd = { ...cfg, bonus: 0.9 };
    const t = trust.effectiveThresholds(policy, trusted, absurd);
    expect(t.auto_approve_min).toBe(trust.HARD_AUTO_APPROVE_FLOOR);
    expect(t.auto_approve_min).toBe(0.75);
    // Even with the lowest legal policy bar AND an absurd bonus.
    const lowest = trust.effectiveThresholds({ auto_approve_min: 0.5, hold_min: 0.5 }, trusted, absurd);
    expect(lowest.auto_approve_min).toBe(0.75);
    // And with a negative/garbage bonus it never goes below the floor either.
    expect(trust.effectiveThresholds(policy, trusted, { ...cfg, bonus: Number.NaN }).auto_approve_min).toBe(0.9);
  });

  test('SAFETY RAIL — trust is independently switchable: disabled → plain policy bars', () => {
    const off = { ...cfg, enabled: false };
    for (const row of [trusted, distrusted, neutral]) {
      const t = trust.effectiveThresholds(policy, row, off);
      expect(t.band).toBe('neutral');
      expect(t.auto_approve_min).toBe(0.9);
      expect(t.hold_min).toBe(0.9);
    }
  });

  test('the raised bar is capped at 1.0 and the lowered hold bar at 0.5', () => {
    const t = trust.effectiveThresholds({ auto_approve_min: 1, hold_min: 0.5 }, distrusted, { ...cfg, penalty: 0.3 });
    expect(t.auto_approve_min).toBe(1);
    expect(t.hold_min).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// 4. The rails, end to end through the processor
// ---------------------------------------------------------------------------
describe('the processor under trust — the rails hold', () => {
  afterEach(async () => {
    await clearTrust(shopA.shop.id);
    await clearTrust(shopB.shop.id);
  });

  test('a TRUSTED shop publishes a 0.85 verdict that a NEUTRAL shop does not', async () => {
    // Neutral first: the same verdict, the same settings, no history.
    const neutralId = await insertPendingImage(shopA.shop.id, 0);
    const a = await configured(() => moderation.moderateShopImage(neutralId, { client: verdictClient('approve', 0.85) }));
    expect(a).toEqual({ outcome: 'review' });
    expect((await imageRow(neutralId)).status).toBe('pending_review');

    // Now give the shop a clean history and repeat.
    const score = await seedTrust(shopA.shop.id, { approved: 20, rejected: 0 });
    expect(score).toBeGreaterThan(trust.TRUSTED_SCORE);
    const trustedId = await insertPendingImage(shopA.shop.id, 1);
    const b = await configured(() => moderation.moderateShopImage(trustedId, { client: verdictClient('approve', 0.85) }));
    expect(b).toEqual({ outcome: 'auto_approve' });
    expect((await imageRow(trustedId)).status).toBe('active');
    // The audit row says WHICH bar it was judged against.
    const audits = await auditsForImage(trustedId);
    expect(audits[0].action).toBe('ai_auto_approve');
    expect(audits[0].metadata.trust_band).toBe('trusted');
    // And the auto-approval banked a point for the shop.
    expect((await trustRow(shopA.shop.id)).approved_count).toBe(21);
  });

  test('a DISTRUSTED shop does not publish even a 0.93 verdict', async () => {
    await seedTrust(shopB.shop.id, { approved: 0, rejected: 2, rejectedDaysAgo: 1 });
    const id = await insertPendingImage(shopB.shop.id, 0);
    const out = await configured(() => moderation.moderateShopImage(id, { client: verdictClient('approve', 0.93) }));
    expect(out).toEqual({ outcome: 'review' });
    const row = await imageRow(id);
    expect(row.status).toBe('pending_review');
    expect(row.ai_verdict).toMatchObject({ decision: 'approve', confidence: 0.93 });
    expect((await auditsForImage(id))[0].metadata.trust_band).toBe('distrusted');
  });

  test('SAFETY RAIL — a 0.60 verdict never auto-approves for ANYONE (the floor)', async () => {
    // The most generous settings the panel allows, plus a spotless history.
    await setSetting('ai_moderation_auto_approve_min', '0.50');
    await setSetting('ai_moderation_trust_bonus', '0.30');
    try {
      await seedTrust(shopA.shop.id, { approved: 50, rejected: 0 });
      const id = await insertPendingImage(shopA.shop.id, 2);
      const out = await configured(() => moderation.moderateShopImage(id, { client: verdictClient('approve', 0.6) }));
      expect(out).toEqual({ outcome: 'review' });
      expect((await imageRow(id)).status).toBe('pending_review');
      // 0.76 clears the floor, so the floor is the only thing that stopped 0.60.
      const ok = await insertPendingImage(shopA.shop.id, 3);
      expect(await configured(() => moderation.moderateShopImage(ok, { client: verdictClient('approve', 0.76) })))
        .toEqual({ outcome: 'auto_approve' });
    } finally {
      await setSetting('ai_moderation_auto_approve_min', '0.90');
      await setSetting('ai_moderation_trust_bonus', '0.05');
    }
  });

  test('SAFETY RAIL — the AI still NEVER rejects, however distrusted the shop', async () => {
    await seedTrust(shopB.shop.id, { approved: 0, rejected: 5, rejectedDaysAgo: 0 });
    const id = await insertPendingImage(shopB.shop.id, 1);
    const out = await configured(() => moderation.moderateShopImage(id, {
      client: verdictClient('hold', 1, 'Nudity.', ['nudity_sexual']),
    }));
    expect(out).toEqual({ outcome: 'hold' });
    const row = await imageRow(id);
    // Held for a human at the top of the queue — never 'rejected'.
    expect(row.status).toBe('pending_review');
    expect(row.ai_flagged).toBe(true);
    const statuses = await pool.query(
      "SELECT DISTINCT status FROM shop_images WHERE shop_id = ANY($1)", [shopIds]
    );
    expect(statuses.rows.map((r) => r.status)).not.toContain('rejected');
    // No decideOutcome branch can ever produce a rejection.
    for (const decision of ['approve', 'hold', 'review']) {
      for (const confidence of [0, 0.5, 0.9, 1]) {
        const o = moderation.decideOutcome({ decision, confidence }, { auto_approve_min: 0.9, hold_min: 0.9 });
        expect(['auto_approve', 'hold', 'review']).toContain(o);
      }
    }
  });

  test('SAFETY RAIL — trust switched off judges a trusted shop at the plain bar', async () => {
    await setSetting('ai_moderation_trust_enabled', 'false');
    try {
      await seedTrust(shopA.shop.id, { approved: 20, rejected: 0 });
      const id = await insertPendingImage(shopA.shop.id, 4);
      const out = await configured(() => moderation.moderateShopImage(id, { client: verdictClient('approve', 0.85) }));
      expect(out).toEqual({ outcome: 'review' });
      expect((await imageRow(id)).status).toBe('pending_review');
      expect((await auditsForImage(id))[0].metadata.trust_band).toBe('neutral');
    } finally {
      await setSetting('ai_moderation_trust_enabled', 'true');
    }
  });

  test('SAFETY RAIL — fail-open: a throwing trust lookup leaves Phase-1 behaviour intact', async () => {
    await seedTrust(shopA.shop.id, { approved: 20, rejected: 0 });
    const spy = jest.spyOn(trust, 'getTrust').mockRejectedValue(new Error('trust table on fire'));
    try {
      // The trusted bar would have published 0.85; without trust it must not.
      const low = await insertPendingImage(shopA.shop.id, 5);
      expect(await configured(() => moderation.moderateShopImage(low, { client: verdictClient('approve', 0.85) })))
        .toEqual({ outcome: 'review' });
      expect((await imageRow(low)).status).toBe('pending_review');
      // And the plain Phase-1 policy still works: 0.97 publishes.
      const high = await insertPendingImage(shopA.shop.id, 6);
      expect(await configured(() => moderation.moderateShopImage(high, { client: verdictClient('approve', 0.97) })))
        .toEqual({ outcome: 'auto_approve' });
      expect((await imageRow(high)).status).toBe('active');
      // Nothing unexpected was written: no spot check was queued off a failed run.
      expect(await spotChecksFor(shopA.shop.id)).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  test('fail-open: a throwing CONFIG read also falls back to the plain policy', async () => {
    const spy = jest.spyOn(trust, 'getTrustConfig').mockRejectedValue(new Error('settings unreadable'));
    try {
      await seedTrust(shopA.shop.id, { approved: 20, rejected: 0 });
      const id = await insertPendingImage(shopA.shop.id, 7);
      expect(await configured(() => moderation.moderateShopImage(id, { client: verdictClient('approve', 0.85) })))
        .toEqual({ outcome: 'review' });
      expect((await imageRow(id)).status).toBe('pending_review');
    } finally {
      spy.mockRestore();
    }
  });

  test('resolveThresholds never throws and always returns a usable pair', async () => {
    const policy = { auto_approve_min: 0.9, hold_min: 0.9 };
    const spy = jest.spyOn(trust, 'getTrustConfig').mockImplementation(() => { throw new Error('boom'); });
    try {
      const t = await moderation.resolveThresholds(shopA.shop.id, policy);
      expect(t.auto_approve_min).toBe(0.9);
      expect(t.hold_min).toBe(0.9);
    } finally {
      spy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// 5. recordOutcome
// ---------------------------------------------------------------------------
describe('recordOutcome — the counters', () => {
  afterEach(() => clearTrust(shopA.shop.id));

  test('upserts a row on the first decision and accumulates after', async () => {
    expect(await trustRow(shopA.shop.id)).toBeNull();
    await trust.recordOutcome(null, { shopId: shopA.shop.id, outcome: 'approved' });
    let row = await trustRow(shopA.shop.id);
    expect(row.approved_count).toBe(1);
    expect(row.rejected_count).toBe(0);
    expect(row.last_rejected_at).toBeNull();
    expect(Number(row.score)).toBeCloseTo(2 / 3, 2);

    await trust.recordOutcome(null, { shopId: shopA.shop.id, outcome: 'approved' });
    await trust.recordOutcome(null, { shopId: shopA.shop.id, outcome: 'rejected' });
    row = await trustRow(shopA.shop.id);
    expect(row.approved_count).toBe(2);
    expect(row.rejected_count).toBe(1);
    expect(row.last_rejected_at).toBeTruthy();
    // 3/5 = 0.6 minus the full freshness penalty of 0.30.
    expect(Number(row.score)).toBeCloseTo(0.3, 2);
  });

  test('a human rejection AFTER an auto-approval moves BOTH counters', async () => {
    await seedTrust(shopA.shop.id, { approved: 10, rejected: 0 });
    // Plain rejection: approved stays, rejected climbs.
    await trust.recordOutcome(null, { shopId: shopA.shop.id, outcome: 'rejected' });
    let row = await trustRow(shopA.shop.id);
    expect(row.approved_count).toBe(10);
    expect(row.rejected_count).toBe(1);

    // Overturn: the earlier approval is taken back as the rejection is added.
    await trust.recordOutcome(null, { shopId: shopA.shop.id, outcome: 'rejected', overturned: true });
    row = await trustRow(shopA.shop.id);
    expect(row.approved_count).toBe(9);
    expect(row.rejected_count).toBe(2);
  });

  test('an overturn can never drive approved_count negative', async () => {
    await trust.recordOutcome(null, { shopId: shopA.shop.id, outcome: 'rejected', overturned: true });
    await trust.recordOutcome(null, { shopId: shopA.shop.id, outcome: 'rejected', overturned: true });
    const row = await trustRow(shopA.shop.id);
    expect(row.approved_count).toBe(0);
    expect(row.rejected_count).toBe(2);
  });

  test('an unknown outcome, or no shop, writes nothing and never throws', async () => {
    await expect(trust.recordOutcome(null, { shopId: shopA.shop.id, outcome: 'rejected_by_ai' })).resolves.toBeNull();
    await expect(trust.recordOutcome(null, { shopId: null, outcome: 'approved' })).resolves.toBeNull();
    await expect(trust.recordOutcome(null, {})).resolves.toBeNull();
    expect(await trustRow(shopA.shop.id)).toBeNull();
  });

  test('a bad shop id fails silently and does NOT poison the caller transaction', async () => {
    const { withTx } = require('../src/config/db');
    const out = await withTx(async (client) => {
      const bad = await trust.recordOutcome(client, {
        shopId: '00000000-0000-0000-0000-000000000000', outcome: 'approved',
      });
      // The FK rejected it, the savepoint absorbed it...
      expect(bad).toBeNull();
      // ...and the transaction is still usable.
      const ok = await client.query('SELECT 1 AS one');
      return ok.rows[0].one;
    });
    expect(out).toBe(1);
  });

  test('a human approve / reject in the admin queue records the outcome', async () => {
    const approved = await insertPendingImage(shopA.shop.id, 20);
    expect((await authHdr(request(app).post(`/api/admin/shop-images/${approved}/approve`), marketing.token).send({})).status).toBe(200);
    expect((await trustRow(shopA.shop.id)).approved_count).toBe(1);

    const rejected = await insertPendingImage(shopA.shop.id, 21);
    expect((await authHdr(request(app).post(`/api/admin/shop-images/${rejected}/reject`), marketing.token).send({})).status).toBe(200);
    const row = await trustRow(shopA.shop.id);
    // A plain rejection of a never-auto-approved photo: no take-back.
    expect(row.approved_count).toBe(1);
    expect(row.rejected_count).toBe(1);
  });

  test('rejecting a photo the AI had auto-approved takes the point back', async () => {
    await setSetting('ai_moderation_spot_check_pct', '0');
    const id = await insertPendingImage(shopA.shop.id, 22);
    expect(await configured(() => moderation.moderateShopImage(id, { client: verdictClient('approve', 0.97) })))
      .toEqual({ outcome: 'auto_approve' });
    let row = await trustRow(shopA.shop.id);
    expect(row.approved_count).toBe(1);
    expect(row.rejected_count).toBe(0);

    expect((await authHdr(request(app).post(`/api/admin/shop-images/${id}/reject`), marketing.token)
      .send({ review_note: 'Actually a selfie.' })).status).toBe(200);
    row = await trustRow(shopA.shop.id);
    expect(row.approved_count).toBe(0);
    expect(row.rejected_count).toBe(1);
    expect((await imageRow(id)).status).toBe('rejected');
  });

  test('a promo approve / reject records against the shop too', async () => {
    const approved = await insertPendingCampaign(shopA.shop.id, shopA.user.id, 'Fresh milk daily');
    expect((await authHdr(request(app).post(`/api/admin/promos/${approved}/approve`), marketing.token).send({})).status).toBe(200);
    expect((await trustRow(shopA.shop.id)).approved_count).toBe(1);
    const rejected = await insertPendingCampaign(shopA.shop.id, shopA.user.id, 'Free beer');
    expect((await authHdr(request(app).post(`/api/admin/promos/${rejected}/reject`), marketing.token).send({ review_note: 'Alcohol.' })).status).toBe(200);
    expect((await trustRow(shopA.shop.id)).rejected_count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 6. Sampling
// ---------------------------------------------------------------------------
describe('post-publish sampling — forced, not random', () => {
  afterEach(async () => {
    await clearTrust(shopA.shop.id);
    await pool.query('DELETE FROM moderation_spot_checks WHERE shop_id = ANY($1)', [shopIds]);
    await setSetting('ai_moderation_spot_check_pct', '0');
  });

  test('shouldSpotCheck is exact at the edges and honours the forced roll', () => {
    expect(trust.shouldSpotCheck(0)).toBe(false);
    expect(trust.shouldSpotCheck(100)).toBe(true);
    expect(trust.shouldSpotCheck(-10)).toBe(false);
    expect(trust.shouldSpotCheck(1000)).toBe(true);
    expect(trust.shouldSpotCheck(10, 0.05)).toBe(true);
    expect(trust.shouldSpotCheck(10, 0.5)).toBe(false);
    trust.setSampler(() => 0);
    expect(trust.shouldSpotCheck(1)).toBe(true);
    trust.setSampler(() => 0.999);
    expect(trust.shouldSpotCheck(99)).toBe(false);
    trust.setSampler(null);
  });

  test('forced ON → one spot-check row per auto-approval, with the verdict', async () => {
    await setSetting('ai_moderation_spot_check_pct', '10');
    trust.setSampler(() => 0); // always inside the 10%
    const id = await insertPendingImage(shopA.shop.id, 30);
    expect(await configured(() => moderation.moderateShopImage(id, { client: verdictClient('approve', 0.97, 'Ordinary shop front.') })))
      .toEqual({ outcome: 'auto_approve' });
    const checks = await spotChecksFor(shopA.shop.id);
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ kind: 'shop_image', target_id: id, status: 'pending', reviewed_by: null });
    expect(checks[0].ai_verdict).toMatchObject({ decision: 'approve', confidence: 0.97 });
  });

  test('forced OFF → nothing is sampled, and the publish is unaffected', async () => {
    await setSetting('ai_moderation_spot_check_pct', '10');
    trust.setSampler(() => 0.999); // outside the 10%
    const id = await insertPendingImage(shopA.shop.id, 31);
    expect(await configured(() => moderation.moderateShopImage(id, { client: verdictClient('approve', 0.97) })))
      .toEqual({ outcome: 'auto_approve' });
    expect((await imageRow(id)).status).toBe('active');
    expect(await spotChecksFor(shopA.shop.id)).toEqual([]);
  });

  test('pct 0 → never sampled even with the roll forced to zero', async () => {
    await setSetting('ai_moderation_spot_check_pct', '0');
    trust.setSampler(() => 0);
    const id = await insertPendingImage(shopA.shop.id, 32);
    expect(await configured(() => moderation.moderateShopImage(id, { client: verdictClient('approve', 0.97) })))
      .toEqual({ outcome: 'auto_approve' });
    expect(await spotChecksFor(shopA.shop.id)).toEqual([]);
  });

  test('pct 100 → always sampled even with the roll forced to one', async () => {
    await setSetting('ai_moderation_spot_check_pct', '100');
    trust.setSampler(() => 0.999);
    const a = await insertPendingImage(shopA.shop.id, 33);
    const b = await insertPendingCampaign(shopA.shop.id, shopA.user.id, 'Fresh coriander');
    await configured(() => moderation.moderateShopImage(a, { client: verdictClient('approve', 0.97) }));
    await configured(() => moderation.moderateCampaign(b, { client: verdictClient('approve', 0.97) }));
    const checks = await spotChecksFor(shopA.shop.id);
    expect(checks.map((c) => c.kind).sort()).toEqual(['campaign', 'shop_image']);
    expect(checks.map((c) => c.status)).toEqual(['pending', 'pending']);
  });

  test('only AUTO-APPROVALS are sampled — a hold or a review is never queued', async () => {
    await setSetting('ai_moderation_spot_check_pct', '100');
    trust.setSampler(() => 0);
    const held = await insertPendingImage(shopA.shop.id, 34);
    const reviewed = await insertPendingImage(shopA.shop.id, 35);
    await configured(() => moderation.moderateShopImage(held, { client: verdictClient('hold', 0.95) }));
    await configured(() => moderation.moderateShopImage(reviewed, { client: verdictClient('approve', 0.6) }));
    expect(await spotChecksFor(shopA.shop.id)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 7. The spot-check queue + the take-down path
// ---------------------------------------------------------------------------
describe('spot checks — the second look', () => {
  const listChecks = (token) => authHdr(request(app).get('/api/admin/moderation/spot-checks'), token);
  const review = (id, token, body) => authHdr(request(app).post(`/api/admin/moderation/spot-checks/${id}`), token).send(body);

  beforeEach(async () => {
    await setSetting('ai_moderation_spot_check_pct', '100');
    trust.setSampler(() => 0);
  });
  afterEach(async () => {
    await setSetting('ai_moderation_spot_check_pct', '0');
    await clearTrust(shopA.shop.id);
    await pool.query('DELETE FROM moderation_spot_checks WHERE shop_id = ANY($1)', [shopIds]);
  });

  // Auto-approve one photo and return { imageId, checkId }. The shop's other
  // photos are cleared first: the public storefront serves only the first three
  // by position, and these tests assert on what a shopper actually sees.
  async function publishAndSample(position) {
    await pool.query('DELETE FROM shop_images WHERE shop_id = $1', [shopA.shop.id]);
    const imageId = await insertPendingImage(shopA.shop.id, position);
    expect(await configured(() => moderation.moderateShopImage(imageId, { client: verdictClient('approve', 0.97, 'Ordinary shop front.') })))
      .toEqual({ outcome: 'auto_approve' });
    const checks = await spotChecksFor(shopA.shop.id);
    const check = checks.find((c) => c.target_id === imageId);
    expect(check).toBeTruthy();
    return { imageId, checkId: check.id };
  }

  test('the queue is gated by ads:manage and shows enough to judge', async () => {
    const { imageId, checkId } = await publishAndSample(40);
    expect((await listChecks(support.token)).status).toBe(403);
    expect((await listChecks(shopA.token)).status).toBe(403);

    const res = await listChecks(marketing.token);
    expect(res.status).toBe(200);
    const ours = res.body.items.find((i) => i.id === checkId);
    expect(ours).toMatchObject({
      kind: 'shop_image', target_id: imageId, shop_id: shopA.shop.id, live: true,
    });
    expect(ours.shop_name).toBeTruthy();
    expect(ours.url).toContain(imageId); // the exact bytes the storefront serves
    expect(ours.ai_verdict).toMatchObject({ decision: 'approve', confidence: 0.97 });
  });

  test("'bad' takes the photo down, decrements trust and audits with the admin's id", async () => {
    const { imageId, checkId } = await publishAndSample(41);
    // It is public before the check.
    let pub = await request(app).get(`/api/public/shops/${shopA.shop.id}`);
    expect(pub.body.shop.images.some((im) => im.url.includes(imageId))).toBe(true);
    expect((await trustRow(shopA.shop.id)).approved_count).toBe(1);

    const res = await review(checkId, marketing.token, { verdict: 'bad', note: 'It is a meme.' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'bad', kind: 'shop_image', target_id: imageId, took_down: true });

    // Back to pending_review — taken down, flagged to the top of the queue.
    const row = await imageRow(imageId);
    expect(row.status).toBe('pending_review');
    expect(row.ai_flagged).toBe(true);
    // No longer served publicly.
    pub = await request(app).get(`/api/public/shops/${shopA.shop.id}`);
    expect(pub.body.shop.images.some((im) => im.url.includes(imageId))).toBe(false);
    // The auto-approval's point was taken back AND a rejection recorded.
    const t = await trustRow(shopA.shop.id);
    expect(t.approved_count).toBe(0);
    expect(t.rejected_count).toBe(1);
    expect(t.last_rejected_at).toBeTruthy();
    // The check itself is closed and stamped.
    const check = (await spotChecksFor(shopA.shop.id)).find((c) => c.id === checkId);
    expect(check).toMatchObject({ status: 'bad', reviewed_by: marketing.id, note: 'It is a meme.' });
    // Audited on the ONE trail, with the ADMIN's id (not NULL like an AI row).
    const audits = await auditsForImage(imageId);
    expect(audits.map((a) => a.action)).toEqual(['ai_auto_approve', 'moderation.spot_check_bad']);
    expect(audits[0].admin_user_id).toBeNull();
    expect(audits[1].admin_user_id).toBe(marketing.id);
    expect(audits[1].metadata).toMatchObject({ spot_check_id: checkId, kind: 'shop_image', took_down: true, ai_decision: 'approve' });
    // It is back in the pre-publish queue for a real decision.
    const q = await authHdr(request(app).get('/api/admin/shop-images/pending'), marketing.token);
    expect(q.body.items.some((i) => i.id === imageId)).toBe(true);
  });

  test("'ok' leaves the item live and changes no counters beyond the check itself", async () => {
    const { imageId, checkId } = await publishAndSample(42);
    const before = await trustRow(shopA.shop.id);
    const res = await review(checkId, marketing.token, { verdict: 'ok' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', took_down: false });
    expect((await imageRow(imageId)).status).toBe('active');
    const after = await trustRow(shopA.shop.id);
    expect(after.approved_count).toBe(before.approved_count);
    expect(after.rejected_count).toBe(before.rejected_count);
    const pub = await request(app).get(`/api/public/shops/${shopA.shop.id}`);
    expect(pub.body.shop.images.some((im) => im.url.includes(imageId))).toBe(true);
    // Closed, so it leaves the pending queue.
    const list = await listChecks(marketing.token);
    expect(list.body.items.some((i) => i.id === checkId)).toBe(false);
  });

  test('a campaign spot check marked bad takes the promo off the air', async () => {
    const campaignId = await insertPendingCampaign(shopA.shop.id, shopA.user.id, 'Buy 1 get 1 atta');
    expect(await configured(() => moderation.moderateCampaign(campaignId, { client: verdictClient('approve', 0.97) })))
      .toEqual({ outcome: 'auto_approve' });
    expect((await campaignRow(campaignId)).status).toBe('active');
    const check = (await spotChecksFor(shopA.shop.id)).find((c) => c.target_id === campaignId);
    const list = await listChecks(marketing.token);
    const item = list.body.items.find((i) => i.id === check.id);
    expect(item.kind).toBe('campaign');
    expect(item.creative).toMatchObject({ offer_text: 'Buy 1 get 1 atta' });

    const res = await review(check.id, marketing.token, { verdict: 'bad' });
    expect(res.status).toBe(200);
    const row = await campaignRow(campaignId);
    expect(row.status).toBe('pending_review');
    expect(row.ai_flagged).toBe(true);
    expect((await trustRow(shopA.shop.id)).rejected_count).toBe(1);
  });

  test('a second review is a 409, so a double tap can never double-count', async () => {
    const { checkId } = await publishAndSample(43);
    expect((await review(checkId, marketing.token, { verdict: 'bad' })).status).toBe(200);
    const t1 = await trustRow(shopA.shop.id);
    const again = await review(checkId, marketing.token, { verdict: 'bad' });
    expect(again.status).toBe(409);
    const t2 = await trustRow(shopA.shop.id);
    expect(t2.rejected_count).toBe(t1.rejected_count);
  });

  test('a bad verdict word is a 400, an unknown id a 404, and support is 403', async () => {
    const { checkId } = await publishAndSample(44);
    expect((await review(checkId, marketing.token, { verdict: 'reject' })).status).toBe(400);
    expect((await review(checkId, marketing.token, {})).status).toBe(400);
    expect((await review('00000000-0000-0000-0000-000000000000', marketing.token, { verdict: 'ok' })).status).toBe(404);
    expect((await review(checkId, support.token, { verdict: 'ok' })).status).toBe(403);
    // Still pending after all of that.
    const check = (await spotChecksFor(shopA.shop.id)).find((c) => c.id === checkId);
    expect(check.status).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// 8. Honest metrics
// ---------------------------------------------------------------------------
describe('aiStats — saved, overturned, precision, spot checks, trust', () => {
  const stats = (token) => authHdr(request(app).get('/api/admin/moderation/ai-stats'), token);

  afterEach(async () => {
    await setSetting('ai_moderation_spot_check_pct', '0');
    await clearTrust(shopA.shop.id);
    await clearTrust(shopB.shop.id);
  });

  test('a known sequence moves saved / overturned / spot_checks by exactly the right deltas', async () => {
    await setSetting('ai_moderation_spot_check_pct', '0');
    const before = (await stats(marketing.token)).body;
    expect(before.days).toBe(30);

    // Three auto-approvals. One is left alone (saved), one is rejected by an
    // admin (overturned), one is sampled and marked bad (overturned).
    const keep = await insertPendingImage(shopA.shop.id, 50);
    const rejectLater = await insertPendingImage(shopA.shop.id, 51);
    await configured(() => moderation.moderateShopImage(keep, { client: verdictClient('approve', 0.97) }));
    await configured(() => moderation.moderateShopImage(rejectLater, { client: verdictClient('approve', 0.97) }));

    await setSetting('ai_moderation_spot_check_pct', '100');
    trust.setSampler(() => 0);
    const sampled = await insertPendingImage(shopA.shop.id, 52);
    await configured(() => moderation.moderateShopImage(sampled, { client: verdictClient('approve', 0.97) }));
    trust.setSampler(null);

    const mid = (await stats(marketing.token)).body;
    expect(mid.precision.auto_approved - before.precision.auto_approved).toBe(3);
    expect(mid.overturned - before.overturned).toBe(0);
    expect(mid.saved - before.saved).toBe(3);
    expect(mid.spot_checks.pending - before.spot_checks.pending).toBe(1);

    // Now overturn two of the three.
    expect((await authHdr(request(app).post(`/api/admin/shop-images/${rejectLater}/reject`), marketing.token).send({})).status).toBe(200);
    const check = (await spotChecksFor(shopA.shop.id)).find((c) => c.target_id === sampled);
    expect((await authHdr(request(app).post(`/api/admin/moderation/spot-checks/${check.id}`), marketing.token)
      .send({ verdict: 'bad' })).status).toBe(200);

    const after = (await stats(marketing.token)).body;
    expect(after.precision.auto_approved - before.precision.auto_approved).toBe(3);
    expect(after.overturned - before.overturned).toBe(2);
    expect(after.saved - before.saved).toBe(1);
    expect(after.spot_checks.pending - before.spot_checks.pending).toBe(0);
    expect(after.spot_checks.bad - before.spot_checks.bad).toBe(1);
    // saved + overturned is always the auto-approved total.
    expect(after.saved + after.overturned).toBe(after.precision.auto_approved);
  });

  test('precision refuses a ratio at small N and states the two raw counts instead', async () => {
    const body = (await stats(marketing.token)).body;
    expect(body.precision.min_sample).toBe(20);
    expect(typeof body.precision.text).toBe('string');
    expect(body.precision.text).toContain(`of ${body.precision.auto_approved} auto-approved`);
    expect(body.precision.text).toContain(`${body.precision.overturned} were later judged wrong`);
    if (body.precision.auto_approved < body.precision.min_sample) {
      expect(body.precision.rate).toBeNull();
    } else {
      expect(typeof body.precision.rate).toBe('number');
      expect(body.precision.rate).toBeCloseTo(body.precision.overturned / body.precision.auto_approved, 3);
    }
    // The raw counts are always there for the UI to fall back on.
    expect(Number.isInteger(body.precision.auto_approved)).toBe(true);
    expect(Number.isInteger(body.precision.overturned)).toBe(true);
  });

  test('trust counts shops by band using the config min_items', async () => {
    const before = (await stats(marketing.token)).body.trust;
    await seedTrust(shopA.shop.id, { approved: 20, rejected: 0 }); // trusted
    await seedTrust(shopB.shop.id, { approved: 0, rejected: 2, rejectedDaysAgo: 1 }); // distrusted
    const after = (await stats(marketing.token)).body.trust;
    expect(after.trusted_shops - before.trusted_shops).toBe(1);
    expect(after.distrusted_shops - before.distrusted_shops).toBe(1);
    expect(after.enabled).toBe(true);
    expect(after.min_items).toBe(5);

    // Raise the bar for history: the same shop is no longer trusted.
    await setSetting('ai_moderation_trust_min_items', '50');
    try {
      const raised = (await stats(marketing.token)).body.trust;
      expect(raised.min_items).toBe(50);
      expect(raised.trusted_shops - before.trusted_shops).toBe(0);
      expect(raised.neutral - before.neutral).toBe(1);
    } finally {
      await setSetting('ai_moderation_trust_min_items', '5');
    }
  });

  test('the stats endpoint is still gated by ads:manage', async () => {
    expect((await stats(support.token)).status).toBe(403);
    expect((await stats(shopA.token)).status).toBe(403);
    expect((await stats(marketing.token)).status).toBe(200);
  });

  test('the Phase-1 fields are all still there', async () => {
    const body = (await stats(marketing.token)).body;
    for (const k of ['days', 'auto_approved', 'held', 'reviewed', 'admin', 'agreement']) {
      expect(body[k]).toBeDefined();
    }
    expect(body.agreement.agreed).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// 9. The settings surface
// ---------------------------------------------------------------------------
describe('admin settings — the five trust knobs', () => {
  test('GET exposes them and PATCH persists + clamps them', async () => {
    const sup = await makeAdmin('super', 'super', '65');
    try {
      const seed = await authHdr(request(app).patch('/api/admin/settings'), sup.token).send({
        ai_moderation_trust_enabled: true,
        ai_moderation_trust_min_items: 5,
        ai_moderation_trust_bonus: 0.05,
        ai_moderation_distrust_penalty: 0.1,
        ai_moderation_spot_check_pct: 10,
      });
      expect(seed.status).toBe(200);
      const got = await authHdr(request(app).get('/api/admin/settings'), sup.token);
      expect(got.body.features.ai_moderation_trust_enabled).toBe(true);
      expect(got.body.features.ai_moderation_trust_min_items).toBe(5);
      expect(got.body.features.ai_moderation_trust_bonus).toBe(0.05);
      expect(got.body.features.ai_moderation_distrust_penalty).toBe(0.1);
      expect(got.body.features.ai_moderation_spot_check_pct).toBe(10);

      // Out of band → rejected by the validator, nothing written.
      expect((await authHdr(request(app).patch('/api/admin/settings'), sup.token)
        .send({ ai_moderation_trust_bonus: 0.9 })).status).toBe(400);
      expect((await authHdr(request(app).patch('/api/admin/settings'), sup.token)
        .send({ ai_moderation_spot_check_pct: 500 })).status).toBe(400);

      // Turning trust off is a plain save — no typed I CONFIRM (not a credential).
      expect((await authHdr(request(app).patch('/api/admin/settings'), sup.token)
        .send({ ai_moderation_trust_enabled: false })).status).toBe(200);
      const cfg = await trust.getTrustConfig();
      expect(cfg.enabled).toBe(false);
    } finally {
      await setSetting('ai_moderation_trust_enabled', 'true');
      await setSetting('ai_moderation_trust_bonus', '0.05');
      await setSetting('ai_moderation_spot_check_pct', '0');
      await pool.query('DELETE FROM users WHERE id = $1', [sup.id]);
    }
  });

  test('getTrustConfig clamps a hand-edited setting and never throws', async () => {
    await setSetting('ai_moderation_trust_bonus', '5');
    await setSetting('ai_moderation_trust_min_items', '-4');
    await setSetting('ai_moderation_spot_check_pct', 'banana');
    try {
      const cfg = await trust.getTrustConfig();
      expect(cfg.bonus).toBe(0.3); // clamped to the 0..0.30 band
      expect(cfg.min_items).toBe(0);
      expect(cfg.spot_check_pct).toBe(trust.TRUST_DEFAULTS.spot_check_pct);
      // And even that clamped bonus cannot break the floor.
      const t = trust.effectiveThresholds({ auto_approve_min: 0.9, hold_min: 0.9 },
        { approved_count: 99, rejected_count: 0, score: 0.99 }, cfg);
      expect(t.auto_approve_min).toBeGreaterThanOrEqual(trust.HARD_AUTO_APPROVE_FLOOR);
    } finally {
      await setSetting('ai_moderation_trust_bonus', '0.05');
      await setSetting('ai_moderation_trust_min_items', '5');
      await setSetting('ai_moderation_spot_check_pct', '0');
    }
  });
});
