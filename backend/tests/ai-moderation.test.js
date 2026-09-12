// Tests for AI-assisted content moderation, PHASE 1 (batch AI-MOD). NO real
// network is ever made — every classification path injects a FAKE client
// (exposing messages.create) or exercises the unconfigured/no-op path, and the
// env vars are set IN-TEST only around the processor calls (so the upload /
// promo-submit routes never enqueue → never touch Redis). Requires a real
// Postgres (DATABASE_URL) with the migrations applied (incl. 0064). Covers:
//   1. migration 0064 — columns + seeded settings.
//   2. pure pieces — parseVerdict (strict JSON, defensive), buildImageRequest
//      (base64 image block) / buildTextRequest, the guardrail prompt.
//   3. classify* fail-open — throwing client, non-JSON, a hanging client
//      (timeout) → null, never throws.
//   4. moderateShopImage policy — not configured → no-op; approve 0.97 →
//      active + ai_auto_approve (admin NULL); approve 0.6 → pending + ai_review;
//      hold 0.95 → pending + flagged + ai_hold; throw / non-JSON → pending, no
//      verdict, no audit; thresholds read LIVE (0.99 stops 0.97); the master
//      setting off → no-op; a trusted-shop upload (already active) → no effect.
//   5. admin surface — pending endpoint exposes ai_verdict/ai_flagged with the
//      flagged row first; admin approve/reject after an AI verdict record
//      metadata.ai_decision / ai_confidence; ai-stats counts + the perm gate.
//   6. campaign path mirrors the photo path (auto-approve + hold), incl. the
//      promo pending endpoint and the promo reject audit after ai_hold.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';
// Start UNCONFIGURED: no key / no model id → the feature is inert, the upload +
// promo routes enqueue nothing (no Redis), and no real client is ever built.
delete process.env.ANTHROPIC_API_KEY;
delete process.env.MODERATION_LLM_MODEL;

const app = require('../src/app');
const { pool } = require('../src/config/db');
const moderation = require('../src/services/moderation.service');

// A real (decodable) 1x1 PNG so sharp can process the trusted-shop upload.
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

// Flip the env gate on/off around a processor call. Everything else in the suite
// runs unconfigured so the HTTP routes never enqueue.
async function configured(fn) {
  process.env.ANTHROPIC_API_KEY = 'test-key-never-used';
  process.env.MODERATION_LLM_MODEL = TEST_MODEL;
  try { return await fn(); } finally {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.MODERATION_LLM_MODEL;
  }
}

// Fake SDK clients — resolve fixed content blocks; NEVER touch the net.
const verdictClient = (decision, confidence, reason = 'Looks like an ordinary shop photo.', categories = []) => {
  const calls = [];
  return {
    calls,
    messages: {
      create: async (params) => {
        calls.push(params);
        return { content: [{ type: 'text', text: JSON.stringify({ decision, confidence, categories, reason }) }] };
      },
    },
  };
};
const textClient = (text) => ({ messages: { create: async () => ({ content: [{ type: 'text', text }] }) } });
const throwingClient = { messages: { create: async () => { throw new Error('upstream exploded'); } } };
const hangingClient = { messages: { create: () => new Promise(() => {}) } };

let owner; // { token, user, shop }
let marketing; // { id, token } — ads:manage
let support; // { id, token } — no ads:*
const imageIds = [];
const campaignIds = [];

async function register(prefix, phoneSeed) {
  const res = await request(app).post('/api/auth/register').send({
    name: `${prefix} Owner`,
    email: `${prefix}_${uniq}@test.local`,
    phone: `+91${phoneSeed}${uniq}`,
    password: 'password123',
    shopName: `${prefix} AI Mod Shop`,
  });
  expect(res.status).toBe(201);
  return { token: res.body.token, user: res.body.user, shop: res.body.shop };
}

async function makeAdmin(key, role, phoneSeed) {
  const r = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role, admin_role)
     VALUES ($1,$2,$3,'x','admin',$4) RETURNING id`,
    [`AIM ${key}`, `aim_${key}_${uniq}@test.local`, `+91${phoneSeed}${uniq}`, role]
  );
  return { id: r.rows[0].id, token: adminToken(r.rows[0].id) };
}

async function setSetting(key, value) {
  await pool.query(
    `INSERT INTO platform_settings (key, value, updated_at) VALUES ($1,$2,NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, value]
  );
}

// A pending photo inserted straight into the table (the upload route is
// exercised separately for the trusted-shop case).
async function insertPendingImage(position = 0) {
  const r = await pool.query(
    `INSERT INTO shop_images (shop_id, position, mime, data, status)
     VALUES ($1, $2, 'image/webp', $3, 'pending_review') RETURNING id`,
    [owner.shop.id, position, PNG_1x1]
  );
  imageIds.push(r.rows[0].id);
  return r.rows[0].id;
}

async function insertPendingCampaign(offer = 'Fresh stock daily') {
  const r = await pool.query(
    `INSERT INTO ad_campaigns
       (style, title, offer_text, subtitle, glyph, advertiser, link_type, link_shop_id,
        status, self_serve, credits_spent_paise, created_by)
     VALUES ('shop', $1, $2, 'Visit us', '🏪', $1, 'shop', $3, 'pending_review', true, 0, $4)
     RETURNING id`,
    [owner.shop.name || 'AI Mod Shop', offer, owner.shop.id, owner.user.id]
  );
  campaignIds.push(r.rows[0].id);
  return r.rows[0].id;
}

const imageRow = async (id) => (await pool.query('SELECT status, reviewed_at, ai_verdict, ai_flagged FROM shop_images WHERE id = $1', [id])).rows[0];
const campaignRow = async (id) => (await pool.query('SELECT status, ai_verdict, ai_flagged FROM ad_campaigns WHERE id = $1', [id])).rows[0];
const imageAudits = async (id) => (await pool.query(
  "SELECT action, admin_user_id, reason, metadata FROM moderation_actions WHERE metadata->>'image_id' = $1 ORDER BY created_at",
  [id]
)).rows;
const campaignAudits = async (id) => (await pool.query(
  'SELECT action, admin_user_id, reason, metadata FROM moderation_actions WHERE target_id = $1 ORDER BY created_at',
  [id]
)).rows;
const aiStats = async (token) => authHdr(request(app).get('/api/admin/moderation/ai-stats'), token);

beforeAll(async () => {
  await setSetting('ai_moderation_enabled', 'true');
  await setSetting('ai_moderation_auto_approve_min', '0.90');
  await setSetting('ai_moderation_hold_min', '0.90');
  marketing = await makeAdmin('mkt', 'marketing', '71');
  support = await makeAdmin('sup', 'support', '72');
  owner = await register('AiM', '73');
  // Listed so the public storefront read serves the auto-approved photo.
  await pool.query('UPDATE shops SET slides_auto_publish = false, is_listed = true WHERE id = $1', [owner.shop.id]);
});

afterAll(async () => {
  // Restore the seeded policy so no other suite inherits a test value.
  await setSetting('ai_moderation_enabled', 'true');
  await setSetting('ai_moderation_auto_approve_min', '0.90');
  await setSetting('ai_moderation_hold_min', '0.90');
  if (imageIds.length) {
    await pool.query("DELETE FROM moderation_actions WHERE metadata->>'image_id' = ANY($1::text[])", [imageIds]);
  }
  await pool.query('DELETE FROM moderation_actions WHERE target_id = ANY($1) OR admin_user_id = ANY($2)',
    [[...campaignIds, owner.shop.id], [marketing.id, support.id]]);
  await pool.query('DELETE FROM ad_campaigns WHERE link_shop_id = $1', [owner.shop.id]);
  await pool.query('DELETE FROM shops WHERE id = $1', [owner.shop.id]); // shop_images cascade
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [[owner.user.id, marketing.id, support.id]]);
  await pool.end();
});

// ---------------------------------------------------------------------------
// 1. migration 0064
// ---------------------------------------------------------------------------
describe('migration 0064 — schema + settings', () => {
  test('shop_images + ad_campaigns gain ai_verdict / ai_flagged; the policy keys are seeded', async () => {
    for (const table of ['shop_images', 'ad_campaigns']) {
      const r = await pool.query(
        `SELECT column_name, data_type, column_default FROM information_schema.columns
          WHERE table_name = $1 AND column_name IN ('ai_verdict','ai_flagged') ORDER BY column_name`,
        [table]
      );
      expect(r.rows.map((x) => x.column_name)).toEqual(['ai_flagged', 'ai_verdict']);
      expect(r.rows[0].data_type).toBe('boolean');
      expect(r.rows[0].column_default).toBe('false');
      expect(r.rows[1].data_type).toBe('jsonb');
    }
    const s = await pool.query(
      `SELECT key FROM platform_settings WHERE key IN
       ('ai_moderation_enabled','ai_moderation_auto_approve_min','ai_moderation_hold_min')`
    );
    expect(s.rows.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 2. pure pieces
// ---------------------------------------------------------------------------
describe('parseVerdict (defensive)', () => {
  test('accepts a clean object and normalises it', () => {
    const v = moderation.parseVerdict('{"decision":"Hold","confidence":0.95,"categories":["nudity_sexual"],"reason":"Nudity."}');
    expect(v).toEqual({ decision: 'hold', confidence: 0.95, categories: ['nudity_sexual'], reason: 'Nudity.' });
  });
  test('extracts the first {...} out of prose / fences', () => {
    const v = moderation.parseVerdict('Sure! ```json\n{"decision":"approve","confidence":1,"categories":[],"reason":"ok"}\n```');
    expect(v.decision).toBe('approve');
    expect(v.confidence).toBe(1);
  });
  test('rejects a bad decision, an out-of-range confidence, an array, and non-JSON', () => {
    expect(moderation.parseVerdict('{"decision":"reject","confidence":0.9}')).toBeNull();
    expect(moderation.parseVerdict('{"decision":"approve","confidence":1.4}')).toBeNull();
    expect(moderation.parseVerdict('{"decision":"approve","confidence":"high"}')).toBeNull();
    expect(moderation.parseVerdict('[1,2,3]')).toBeNull();
    expect(moderation.parseVerdict('{"decision":"approve"}')).toBeNull(); // no confidence
    expect(moderation.parseVerdict('I cannot help with that.')).toBeNull();
    expect(moderation.parseVerdict('')).toBeNull();
    expect(moderation.parseVerdict(null)).toBeNull();
  });
});

describe('buildImageRequest / buildTextRequest (pure)', () => {
  test('the image rides as a base64 image block + a text instruction; the reason language is named', () => {
    const { system, messages } = moderation.buildImageRequest({ mime: 'image/webp', bytes: PNG_1x1, shopName: 'Ram Kirana', lang: 'hi' });
    expect(system).toBe(moderation.GUARDRAILS);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    const [img, txt] = messages[0].content;
    expect(img).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/webp', data: PNG_1x1.toString('base64') } });
    expect(txt.type).toBe('text');
    expect(txt.text).toContain('Ram Kirana');
    expect(txt.text).toContain('language: hi');
  });
  test('the promo creative rides as labelled lines', () => {
    const { messages } = moderation.buildTextRequest({ title: 'Ram Kirana', offerText: '10% off', subtitle: 'Open late', shopName: 'Ram Kirana' });
    expect(messages[0].content).toContain('Title: Ram Kirana');
    expect(messages[0].content).toContain('Offer text: 10% off');
    expect(messages[0].content).toContain('Subtitle: Open late');
    expect(messages[0].content).toContain('language: en');
  });
  test('the guardrail prompt names the categories, the three decisions, strict JSON and never-reject', () => {
    const g = moderation.GUARDRAILS.toLowerCase();
    for (const c of ['nudity', 'violence', 'alcohol', 'hate', 'off_topic', 'misleading', 'brand', 'pii', 'poor_quality']) {
      expect(g).toContain(c);
    }
    expect(g).toContain('"approve"');
    expect(g).toContain('"hold"');
    expect(g).toContain('"review"');
    expect(g).toContain('strict json');
    expect(g).toContain('never reject');
    expect(g).toContain('indian language');
  });
});

// ---------------------------------------------------------------------------
// 3. classify* fail-open
// ---------------------------------------------------------------------------
describe('classifyImage / classifyText — fail-open, never throws', () => {
  const img = { mime: 'image/webp', bytes: PNG_1x1, shopName: 'S' };
  test('a good verdict is stamped with the model id + timestamp', async () => {
    await configured(async () => {
      const client = verdictClient('approve', 0.97);
      const v = await moderation.classifyImage(img, { client });
      expect(v).toMatchObject({ decision: 'approve', confidence: 0.97, model: TEST_MODEL });
      expect(typeof v.at).toBe('string');
      expect(new Date(v.at).getTime()).toBeGreaterThan(0);
      // The call carried the env model id, a small budget and the image block.
      expect(client.calls[0].model).toBe(TEST_MODEL);
      expect(client.calls[0].max_tokens).toBeLessThanOrEqual(moderation.DEFAULT_MAX_TOKENS);
      expect(client.calls[0].messages[0].content[0].type).toBe('image');
    });
  });
  test('throwing client → null', async () => {
    await expect(moderation.classifyImage(img, { client: throwingClient })).resolves.toBeNull();
    await expect(moderation.classifyText({ title: 'x' }, { client: throwingClient })).resolves.toBeNull();
  });
  test('non-JSON / refusal → null', async () => {
    await expect(moderation.classifyImage(img, { client: textClient('I am unable to classify this.') })).resolves.toBeNull();
    await expect(moderation.classifyText({ title: 'x' }, { client: textClient('') })).resolves.toBeNull();
  });
  test('a hanging client hits the timeout → null', async () => {
    await expect(moderation.classifyText({ title: 'x' }, { client: hangingClient, timeoutMs: 50 })).resolves.toBeNull();
  });
  test('unconfigured with no client → null (no client built, no network)', async () => {
    expect(moderation.isConfigured()).toBe(false);
    expect(moderation.getClient()).toBeNull();
    await expect(moderation.classifyText({ title: 'x' })).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. moderateShopImage — policy
// ---------------------------------------------------------------------------
describe('moderateShopImage — policy under the live thresholds', () => {
  test('not configured (no env) → no-op: row pending, no ai_verdict, no audit', async () => {
    const id = await insertPendingImage(0);
    const out = await moderation.moderateShopImage(id, { client: verdictClient('approve', 0.99) });
    expect(out).toEqual({ skipped: 'not_configured' });
    const row = await imageRow(id);
    expect(row.status).toBe('pending_review');
    expect(row.ai_verdict).toBeNull();
    expect(row.ai_flagged).toBe(false);
    expect(await imageAudits(id)).toEqual([]);
  });

  test('approve 0.97 → active + reviewed_at, verdict stored, audit ai_auto_approve with admin NULL', async () => {
    const id = await insertPendingImage(1);
    const out = await configured(() => moderation.moderateShopImage(id, { client: verdictClient('approve', 0.97, 'Ordinary shop front.') }));
    expect(out).toEqual({ outcome: 'auto_approve' });
    const row = await imageRow(id);
    expect(row.status).toBe('active');
    expect(row.reviewed_at).toBeTruthy();
    expect(row.ai_flagged).toBe(false);
    expect(row.ai_verdict).toMatchObject({ decision: 'approve', confidence: 0.97, reason: 'Ordinary shop front.', model: TEST_MODEL });
    const audits = await imageAudits(id);
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe('ai_auto_approve');
    expect(audits[0].admin_user_id).toBeNull();
    expect(audits[0].reason).toBe('Ordinary shop front.');
    expect(audits[0].metadata).toMatchObject({ image_id: id, decision: 'approve', confidence: 0.97 });
    // Served publicly like an admin-approved photo.
    const pub = await request(app).get(`/api/public/shops/${owner.shop.id}`);
    expect(pub.status).toBe(200);
    expect(pub.body.shop.images.some((im) => im.url.includes(id))).toBe(true);
  });

  test('approve 0.6 (below threshold) → stays pending, verdict stored, audit ai_review, not flagged', async () => {
    const id = await insertPendingImage(2);
    const out = await configured(() => moderation.moderateShopImage(id, { client: verdictClient('approve', 0.6) }));
    expect(out).toEqual({ outcome: 'review' });
    const row = await imageRow(id);
    expect(row.status).toBe('pending_review');
    expect(row.ai_flagged).toBe(false);
    expect(row.ai_verdict).toMatchObject({ decision: 'approve', confidence: 0.6 });
    const audits = await imageAudits(id);
    expect(audits.map((a) => a.action)).toEqual(['ai_review']);
    expect(audits[0].admin_user_id).toBeNull();
  });

  test('hold 0.95 → stays pending, ai_flagged=true, audit ai_hold', async () => {
    const id = await insertPendingImage(3);
    const out = await configured(() => moderation.moderateShopImage(id, { client: verdictClient('hold', 0.95, 'Alcohol bottles on display.', ['alcohol_tobacco']) }));
    expect(out).toEqual({ outcome: 'hold' });
    const row = await imageRow(id);
    expect(row.status).toBe('pending_review');
    expect(row.ai_flagged).toBe(true);
    expect(row.ai_verdict).toMatchObject({ decision: 'hold', confidence: 0.95, categories: ['alcohol_tobacco'] });
    const audits = await imageAudits(id);
    expect(audits.map((a) => a.action)).toEqual(['ai_hold']);
    // NOT served publicly — still pending.
    const pub = await request(app).get(`/api/public/shops/${owner.shop.id}`);
    expect(pub.body.shop.images.some((im) => im.url.includes(id))).toBe(false);
  });

  test('hold 0.7 (below hold_min) → pending, NOT flagged, audit ai_review', async () => {
    const id = await insertPendingImage(4);
    const out = await configured(() => moderation.moderateShopImage(id, { client: verdictClient('hold', 0.7) }));
    expect(out).toEqual({ outcome: 'review' });
    const row = await imageRow(id);
    expect(row.status).toBe('pending_review');
    expect(row.ai_flagged).toBe(false);
    expect((await imageAudits(id)).map((a) => a.action)).toEqual(['ai_review']);
  });

  test('fake throws / returns non-JSON → pending, no verdict, no audit, no crash', async () => {
    const id = await insertPendingImage(5);
    const a = await configured(() => moderation.moderateShopImage(id, { client: throwingClient }));
    expect(a).toEqual({ skipped: 'no_verdict' });
    const b = await configured(() => moderation.moderateShopImage(id, { client: textClient('not json at all') }));
    expect(b).toEqual({ skipped: 'no_verdict' });
    const row = await imageRow(id);
    expect(row.status).toBe('pending_review');
    expect(row.ai_verdict).toBeNull();
    expect(row.ai_flagged).toBe(false);
    expect(await imageAudits(id)).toEqual([]);
    // A later successful run still triages it (nothing was written).
    const c = await configured(() => moderation.moderateShopImage(id, { client: verdictClient('approve', 0.99) }));
    expect(c).toEqual({ outcome: 'auto_approve' });
    expect((await imageRow(id)).status).toBe('active');
  });

  test('thresholds are read LIVE: auto_approve_min 0.99 → approve 0.97 is only ai_review', async () => {
    await setSetting('ai_moderation_auto_approve_min', '0.99');
    try {
      const id = await insertPendingImage(6);
      const out = await configured(() => moderation.moderateShopImage(id, { client: verdictClient('approve', 0.97) }));
      expect(out).toEqual({ outcome: 'review' });
      const row = await imageRow(id);
      expect(row.status).toBe('pending_review');
      expect(row.ai_verdict).toMatchObject({ decision: 'approve', confidence: 0.97 });
      expect((await imageAudits(id)).map((a) => a.action)).toEqual(['ai_review']);
    } finally {
      await setSetting('ai_moderation_auto_approve_min', '0.90');
    }
  });

  test('ai_moderation_enabled=false → no-op even with the env set (nothing written)', async () => {
    await setSetting('ai_moderation_enabled', 'false');
    try {
      expect(await configured(() => moderation.configured())).toBe(false);
      const id = await insertPendingImage(7);
      const out = await configured(() => moderation.moderateShopImage(id, { client: verdictClient('approve', 0.99) }));
      expect(out).toEqual({ skipped: 'not_configured' });
      const row = await imageRow(id);
      expect(row.status).toBe('pending_review');
      expect(row.ai_verdict).toBeNull();
      expect(await imageAudits(id)).toEqual([]);
    } finally {
      await setSetting('ai_moderation_enabled', 'true');
    }
  });

  test('a row that already has a verdict is never re-triaged (idempotent job)', async () => {
    const id = await insertPendingImage(8);
    await configured(() => moderation.moderateShopImage(id, { client: verdictClient('approve', 0.6) }));
    const again = await configured(() => moderation.moderateShopImage(id, { client: verdictClient('approve', 0.99) }));
    expect(again).toEqual({ skipped: 'not_pending' });
    expect((await imageRow(id)).status).toBe('pending_review');
    expect(await imageAudits(id)).toHaveLength(1);
  });

  test('trusted-shop upload lands active → the processor has no effect', async () => {
    await pool.query('UPDATE shops SET slides_auto_publish = true WHERE id = $1', [owner.shop.id]);
    // Clear the 3-photo cap for the upload (the direct inserts above count).
    await pool.query('DELETE FROM shop_images WHERE shop_id = $1', [owner.shop.id]);
    try {
      const up = await authHdr(request(app).post('/api/shops/me/images'), owner.token)
        .attach('image', PNG_1x1, { filename: 'photo.png', contentType: 'image/png' });
      expect(up.status).toBe(201);
      expect(up.body.status).toBe('active');
      imageIds.push(up.body.id);
      const out = await configured(() => moderation.moderateShopImage(up.body.id, { client: verdictClient('hold', 0.99) }));
      expect(out).toEqual({ skipped: 'not_pending' });
      const row = await imageRow(up.body.id);
      expect(row.status).toBe('active');
      expect(row.ai_verdict).toBeNull();
      expect(row.ai_flagged).toBe(false);
      expect(await imageAudits(up.body.id)).toEqual([]);
    } finally {
      await pool.query('UPDATE shops SET slides_auto_publish = false WHERE id = $1', [owner.shop.id]);
      await pool.query('DELETE FROM shop_images WHERE shop_id = $1', [owner.shop.id]);
    }
  });

  test('an unknown id → skipped, no crash', async () => {
    const out = await configured(() => moderation.moderateShopImage('00000000-0000-0000-0000-000000000000', { client: verdictClient('approve', 0.99) }));
    expect(out).toEqual({ skipped: 'not_found' });
  });
});

// ---------------------------------------------------------------------------
// 5. admin surface — queue exposure, override metadata, stats
// ---------------------------------------------------------------------------
describe('admin queue + overrides + ai-stats', () => {
  let heldId; let reviewId; let plainId;

  beforeAll(async () => {
    // Oldest first would be plain → review → held; the flag must beat that order.
    plainId = await insertPendingImage(0);
    reviewId = await insertPendingImage(1);
    heldId = await insertPendingImage(2);
    await configured(() => moderation.moderateShopImage(reviewId, { client: verdictClient('approve', 0.6, 'Probably fine.') }));
    await configured(() => moderation.moderateShopImage(heldId, { client: verdictClient('hold', 0.95, 'Shows a phone number.', ['pii']) }));
  });

  test('GET /shop-images/pending exposes ai_verdict + ai_flagged, flagged first', async () => {
    const res = await authHdr(request(app).get('/api/admin/shop-images/pending'), marketing.token);
    expect(res.status).toBe(200);
    const ours = res.body.items.filter((i) => i.shop_id === owner.shop.id);
    expect(ours.map((i) => i.id)).toEqual([heldId, plainId, reviewId]);
    const held = ours[0];
    expect(held.ai_flagged).toBe(true);
    expect(held.ai_verdict).toMatchObject({ decision: 'hold', confidence: 0.95, reason: 'Shows a phone number.' });
    expect(ours[1]).toMatchObject({ id: plainId, ai_flagged: false, ai_verdict: null });
    expect(ours[2].ai_verdict).toMatchObject({ decision: 'approve', confidence: 0.6 });
    // The flagged row is the very first item of the whole queue.
    expect(res.body.items[0].ai_flagged).toBe(true);
  });

  test('admin approve after ai_hold writes metadata.ai_decision=hold + ai_confidence', async () => {
    const res = await authHdr(request(app).post(`/api/admin/shop-images/${heldId}/approve`), marketing.token).send({});
    expect(res.status).toBe(200);
    const audits = await imageAudits(heldId);
    expect(audits.map((a) => a.action)).toEqual(['ai_hold', 'shop_image.approve']);
    expect(audits[1].admin_user_id).toBe(marketing.id);
    expect(audits[1].metadata).toMatchObject({ image_id: heldId, to: 'active', ai_decision: 'hold', ai_confidence: 0.95 });
  });

  test('admin reject after ai_review(approve 0.6) writes ai_decision=approve; a no-AI row writes null', async () => {
    const rej = await authHdr(request(app).post(`/api/admin/shop-images/${reviewId}/reject`), marketing.token)
      .send({ review_note: 'Probably fine.' });
    expect(rej.status).toBe(200);
    const audits = await imageAudits(reviewId);
    expect(audits.map((a) => a.action)).toEqual(['ai_review', 'shop_image.reject']);
    expect(audits[1].metadata).toMatchObject({ to: 'rejected', ai_decision: 'approve', ai_confidence: 0.6 });

    const plain = await authHdr(request(app).post(`/api/admin/shop-images/${plainId}/reject`), marketing.token).send({});
    expect(plain.status).toBe(200);
    const pa = await imageAudits(plainId);
    expect(pa).toHaveLength(1);
    expect(pa[0].metadata).toMatchObject({ ai_decision: null, ai_confidence: null });
  });

  test('GET /moderation/ai-stats counts a known sequence (deltas) and is gated by ads:manage', async () => {
    expect((await aiStats(support.token)).status).toBe(403);
    expect((await authHdr(request(app).get('/api/admin/moderation/ai-stats'), owner.token)).status).toBe(403);

    const before = (await aiStats(marketing.token)).body;
    expect(before.days).toBe(30);

    // One auto-approve, one hold then admin-approved (disagree), one review then
    // admin-rejected, one hold then admin-rejected (agree).
    const a = await insertPendingImage(10);
    const h1 = await insertPendingImage(11);
    const r1 = await insertPendingImage(12);
    const h2 = await insertPendingImage(13);
    await configured(() => moderation.moderateShopImage(a, { client: verdictClient('approve', 0.97) }));
    await configured(() => moderation.moderateShopImage(h1, { client: verdictClient('hold', 0.95) }));
    await configured(() => moderation.moderateShopImage(r1, { client: verdictClient('review', 0.5) }));
    await configured(() => moderation.moderateShopImage(h2, { client: verdictClient('hold', 0.92) }));
    expect((await authHdr(request(app).post(`/api/admin/shop-images/${h1}/approve`), marketing.token).send({})).status).toBe(200);
    expect((await authHdr(request(app).post(`/api/admin/shop-images/${r1}/reject`), marketing.token).send({})).status).toBe(200);
    expect((await authHdr(request(app).post(`/api/admin/shop-images/${h2}/reject`), marketing.token).send({})).status).toBe(200);

    const after = (await aiStats(marketing.token)).body;
    expect(after.auto_approved - before.auto_approved).toBe(1);
    expect(after.held - before.held).toBe(2);
    expect(after.reviewed - before.reviewed).toBe(1);
    expect(after.admin.approve_after_ai_hold - before.admin.approve_after_ai_hold).toBe(1);
    expect(after.admin.reject_after_ai_hold - before.admin.reject_after_ai_hold).toBe(1);
    expect(after.admin.reject_after_ai_review - before.admin.reject_after_ai_review).toBe(1);
    expect(after.admin.approve_after_ai_approve - before.admin.approve_after_ai_approve).toBe(0);
    expect(after.admin.reject_after_ai_approve - before.admin.reject_after_ai_approve).toBe(0);
    expect(after.agreement.agreed - before.agreement.agreed).toBe(1);
    expect(after.agreement.disagreed - before.agreement.disagreed).toBe(1);
  });

  test('GET /admin/settings exposes the toggle, thresholds and the configured line; PATCH persists + clamps', async () => {
    const sup = await makeAdmin('super', 'super', '74');
    try {
      // getSettings reads the in-memory settings cache (like every other flag),
      // so seed it through the same PATCH path the admin UI uses.
      const seed = await authHdr(request(app).patch('/api/admin/settings'), sup.token)
        .send({ ai_moderation_enabled: true, ai_moderation_auto_approve_min: 0.9, ai_moderation_hold_min: 0.9 });
      expect(seed.status).toBe(200);
      const got = await authHdr(request(app).get('/api/admin/settings'), sup.token);
      expect(got.status).toBe(200);
      expect(got.body.features.ai_moderation_enabled).toBe(true);
      expect(got.body.features.ai_moderation_auto_approve_min).toBe(0.9);
      expect(got.body.features.ai_moderation_hold_min).toBe(0.9);
      expect(got.body.features.ai_moderation_configured).toBe(false); // env unset in tests

      const bad = await authHdr(request(app).patch('/api/admin/settings'), sup.token).send({ ai_moderation_hold_min: 0.2 });
      expect(bad.status).toBe(400);
      const ok = await authHdr(request(app).patch('/api/admin/settings'), sup.token)
        .send({ ai_moderation_auto_approve_min: 0.95, ai_moderation_enabled: false });
      expect(ok.status).toBe(200);
      const v = await pool.query("SELECT key, value FROM platform_settings WHERE key IN ('ai_moderation_auto_approve_min','ai_moderation_enabled') ORDER BY key");
      expect(v.rows).toEqual([
        { key: 'ai_moderation_auto_approve_min', value: '0.95' },
        { key: 'ai_moderation_enabled', value: 'false' },
      ]);
      const again = await authHdr(request(app).get('/api/admin/settings'), sup.token);
      expect(again.body.features.ai_moderation_auto_approve_min).toBe(0.95);
      expect(again.body.features.ai_moderation_enabled).toBe(false);
    } finally {
      await setSetting('ai_moderation_auto_approve_min', '0.90');
      await setSetting('ai_moderation_enabled', 'true');
      await pool.query('DELETE FROM users WHERE id = $1', [sup.id]);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. campaign path mirrors the photo path
// ---------------------------------------------------------------------------
describe('moderateCampaign — owner promos', () => {
  test('not configured → no-op', async () => {
    const id = await insertPendingCampaign('No-op promo');
    expect(await moderation.moderateCampaign(id, { client: verdictClient('approve', 0.99) })).toEqual({ skipped: 'not_configured' });
    const row = await campaignRow(id);
    expect(row.status).toBe('pending_review');
    expect(row.ai_verdict).toBeNull();
    expect(await campaignAudits(id)).toEqual([]);
  });

  test('approve 0.97 → active, verdict stored, audit ai_auto_approve (admin NULL); the text request carried the creative', async () => {
    const id = await insertPendingCampaign('Fresh vegetables every morning');
    const client = verdictClient('approve', 0.97, 'Honest local offer.');
    const out = await configured(() => moderation.moderateCampaign(id, { client }));
    expect(out).toEqual({ outcome: 'auto_approve' });
    expect(client.calls[0].messages[0].content).toContain('Offer text: Fresh vegetables every morning');
    const row = await campaignRow(id);
    expect(row.status).toBe('active');
    expect(row.ai_flagged).toBe(false);
    expect(row.ai_verdict).toMatchObject({ decision: 'approve', confidence: 0.97, model: TEST_MODEL });
    const audits = await campaignAudits(id);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: 'ai_auto_approve', admin_user_id: null, reason: 'Honest local offer.' });
    expect(audits[0].metadata).toMatchObject({ shop_id: owner.shop.id, decision: 'approve' });
  });

  test('hold 0.95 → pending + flagged + ai_hold; pending endpoint lists it first with the verdict; admin reject records ai_decision=hold', async () => {
    const plain = await insertPendingCampaign('Plain promo');
    const held = await insertPendingCampaign('Free beer with every purchase');
    const out = await configured(() => moderation.moderateCampaign(held, { client: verdictClient('hold', 0.95, 'Alcohol promotion.', ['alcohol_tobacco']) }));
    expect(out).toEqual({ outcome: 'hold' });
    const row = await campaignRow(held);
    expect(row.status).toBe('pending_review');
    expect(row.ai_flagged).toBe(true);
    expect((await campaignAudits(held)).map((a) => a.action)).toEqual(['ai_hold']);

    const q = await authHdr(request(app).get('/api/admin/promos/pending'), marketing.token);
    expect(q.status).toBe(200);
    const ours = q.body.items.filter((i) => i.link_shop_id === owner.shop.id);
    // The held promo (newest) beats the older unflagged ones (incl. the no-op
    // promo from the first test) purely on the flag.
    expect(ours[0].id).toBe(held);
    expect(ours[0]).toMatchObject({ ai_flagged: true, ai_verdict: { decision: 'hold', confidence: 0.95, reason: 'Alcohol promotion.' } });
    expect(ours.slice(1).map((i) => i.id)).toContain(plain);
    expect(ours.slice(1).every((i) => i.ai_flagged === false && i.ai_verdict === null)).toBe(true);
    expect(q.body.items[0].ai_flagged).toBe(true);

    const rej = await authHdr(request(app).post(`/api/admin/promos/${held}/reject`), marketing.token)
      .send({ review_note: 'Alcohol promotion.' });
    expect(rej.status).toBe(200);
    expect(rej.body.refunded_paise).toBe(0);
    const audits = await campaignAudits(held);
    expect(audits.map((a) => a.action)).toEqual(['ai_hold', 'promo.reject']);
    expect(audits[1].admin_user_id).toBe(marketing.id);
    expect(audits[1].metadata).toMatchObject({ to: 'rejected', ai_decision: 'hold', ai_confidence: 0.95 });

    const appr = await authHdr(request(app).post(`/api/admin/promos/${plain}/approve`), marketing.token).send({});
    expect(appr.status).toBe(200);
    const pa = await campaignAudits(plain);
    expect(pa.map((a) => a.action)).toEqual(['promo.approve']);
    expect(pa[0].metadata).toMatchObject({ to: 'active', ai_decision: null });
  });

  test('throwing client → pending, no verdict, no audit; an admin-authored (non self-serve) campaign is never triaged', async () => {
    const id = await insertPendingCampaign('Boom');
    expect(await configured(() => moderation.moderateCampaign(id, { client: throwingClient }))).toEqual({ skipped: 'no_verdict' });
    expect((await campaignRow(id)).ai_verdict).toBeNull();
    expect(await campaignAudits(id)).toEqual([]);

    const house = await pool.query(
      `INSERT INTO ad_campaigns (style, title, status, self_serve, link_shop_id) VALUES ('offer','House',
       'pending_review', false, $1) RETURNING id`,
      [owner.shop.id]
    );
    campaignIds.push(house.rows[0].id);
    expect(await configured(() => moderation.moderateCampaign(house.rows[0].id, { client: verdictClient('approve', 0.99) }))).toEqual({ skipped: 'not_pending' });
    expect((await campaignRow(house.rows[0].id)).status).toBe('pending_review');
  });
});
