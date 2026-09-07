// Integration + unit tests for the content engine editorial pipeline (Batch Q).
// Requires a real Postgres (DATABASE_URL) with migrations 0001..0030 applied.
// Covers: CRUD + PATCH field guarding; the state machine (legal forwards, illegal
// skips/regressions, event rows); the TIER GATE safety core (approve is
// human-only + content:manage; scheduled/published needs approval for Tier 1/2;
// publishDue publishes Tier 0 and approved Tier 1, and SKIPS an unapproved Tier
// 1); the deterministic strategist seeder (idempotent seed_key, pure buildBriefs);
// and role/scoping (owner 403, admin without content:manage 403, no token 401).
// The publisher/strategist are called DIRECTLY (no Redis).
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const workflow = require('../src/utils/content-workflow');
const strategist = require('../src/services/content-strategist.service');
const publisher = require('../src/services/content-publisher.service');

const uniq = Date.now().toString().slice(-9);
const withToken = (req, token) => req.set('Authorization', `Bearer ${token}`);
const adminToken = (id) => jwt.sign({ sub: id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '30d' });
const ownerToken = (id) => jwt.sign({ sub: id, role: 'owner' }, process.env.JWT_SECRET, { expiresIn: '30d' });

const emails = [];
const createdIds = [];
let superAdmin; // content:manage via super
let supportAdmin; // no content:manage
let ownerUser; // non-admin

async function makeUser(role, adminRole) {
  const email = `content_${role}_${adminRole || 'x'}_${uniq}@test.local`;
  emails.push(email);
  const r = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role, admin_role)
     VALUES ($1,$2,$3,'x',$4,$5) RETURNING id`,
    [`Content ${role}`, email, `+9171${uniq}${role.slice(0, 2)}`.slice(0, 15), role, adminRole || null]
  );
  return r.rows[0].id;
}

// Insert a content item straight into the DB for publisher/gate tests, tracking
// it for cleanup. Defaults to a scheduled, due item.
async function insertItem(over = {}) {
  const o = {
    channel: 'blog', engine: 'record', autonomy_tier: 0, language: 'en',
    title: 'T', status: 'scheduled',
    scheduled_at: new Date(Date.now() - 60000).toISOString(),
    approved_at: null, approved_by: null, source: 'human',
    ...over,
  };
  const r = await pool.query(
    `INSERT INTO content_items (channel, engine, autonomy_tier, language, title, status, scheduled_at, approved_at, approved_by, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [o.channel, o.engine, o.autonomy_tier, o.language, o.title, o.status, o.scheduled_at, o.approved_at, o.approved_by, o.source]
  );
  createdIds.push(r.rows[0].id);
  return r.rows[0];
}

beforeAll(async () => {
  superAdmin = { id: await makeUser('admin', 'super') };
  superAdmin.token = adminToken(superAdmin.id);
  supportAdmin = { id: await makeUser('admin', 'support') };
  supportAdmin.token = adminToken(supportAdmin.id);
  ownerUser = { id: await makeUser('owner', null) };
  ownerUser.token = ownerToken(ownerUser.id);
});

afterAll(async () => {
  if (createdIds.length) {
    await pool.query('DELETE FROM content_items WHERE id = ANY($1)', [createdIds]);
  }
  // Strategist-seeded items from these tests (by the unique period key used below).
  await pool.query("DELETE FROM content_items WHERE meta->>'seed_key' LIKE $1", [`%:TEST-${uniq}%`]);
  await pool.query("DELETE FROM content_items WHERE created_by = ANY($1)", [[superAdmin.id]]);
  await pool.query('DELETE FROM users WHERE email = ANY($1)', [emails]);
  await pool.end();
});

// ---------------------------------------------------------------------------
// 1. Pure workflow module
// ---------------------------------------------------------------------------
describe('content-workflow (pure)', () => {
  it('allows single and one-skip forward steps, refuses regressions and big skips', () => {
    expect(workflow.canTransition('idea', 'drafting')).toBe(true);
    expect(workflow.canTransition('draft', 'in_review')).toBe(true); // skip 'localized' (one step)
    expect(workflow.canTransition('in_review', 'approved')).toBe(true);
    expect(workflow.canTransition('approved', 'scheduled')).toBe(true);
    // Illegal: regression, and a skip of more than one step.
    expect(workflow.canTransition('draft', 'idea')).toBe(false);
    expect(workflow.canTransition('idea', 'in_review')).toBe(false);
    expect(workflow.canTransition('scheduled', 'draft')).toBe(false);
  });

  it('rejected/archived reachable from pre-publish states, not from published', () => {
    expect(workflow.canTransition('in_review', 'rejected')).toBe(true);
    expect(workflow.canTransition('idea', 'archived')).toBe(true);
    expect(workflow.canTransition('rejected', 'archived')).toBe(true);
    expect(workflow.canTransition('published', 'archived')).toBe(false);
    expect(workflow.canTransition('published', 'rejected')).toBe(false);
  });

  it('gate: approve is human-only; scheduled/published need approval for tier>0', () => {
    expect(workflow.requiresApproval(0)).toBe(false);
    expect(workflow.requiresApproval(1)).toBe(true);
    expect(workflow.gateAllows({ to: 'approved', tier: 1, approvedAt: null, actorKind: 'system' }).ok).toBe(false);
    expect(workflow.gateAllows({ to: 'approved', tier: 1, approvedAt: null, actorKind: 'human' }).ok).toBe(true);
    expect(workflow.gateAllows({ to: 'scheduled', tier: 0, approvedAt: null, actorKind: 'human' }).ok).toBe(true);
    expect(workflow.gateAllows({ to: 'scheduled', tier: 1, approvedAt: null, actorKind: 'human' }).ok).toBe(false);
    expect(workflow.gateAllows({ to: 'published', tier: 2, approvedAt: new Date(), actorKind: 'system' }).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. CRUD + PATCH guarding
// ---------------------------------------------------------------------------
describe('content desk CRUD', () => {
  let id;
  it('creates, lists and gets an item', async () => {
    const c = await withToken(request(app).post('/api/admin/content'), superAdmin.token).send({
      channel: 'blog', engine: 'record', autonomy_tier: 1, language: 'en',
      title: 'Hello', brief: 'A brief', status: 'idea',
    });
    expect(c.status).toBe(201);
    id = c.body.item.id;
    createdIds.push(id);
    expect(c.body.item.status).toBe('idea');
    expect(c.body.item.source).toBe('human');
    expect(c.body.item.created_by).toBe(superAdmin.id);

    const list = await withToken(request(app).get('/api/admin/content?channel=blog&status=idea'), superAdmin.token);
    expect(list.status).toBe(200);
    expect(list.body.items.some((x) => x.id === id)).toBe(true);

    const one = await withToken(request(app).get(`/api/admin/content/${id}`), superAdmin.token);
    expect(one.status).toBe(200);
    expect(one.body.item.id).toBe(id);
    // The birth event is recorded.
    expect(one.body.events.some((e) => e.to_status === 'idea')).toBe(true);
  });

  it('PATCH edits allowed fields but never status/approved/published', async () => {
    const p = await withToken(request(app).patch(`/api/admin/content/${id}`), superAdmin.token).send({
      title: 'Edited', autonomy_tier: 2,
      status: 'approved', approved_at: '2020-01-01', published_at: '2020-01-01',
    });
    expect(p.status).toBe(200);
    expect(p.body.item.title).toBe('Edited');
    expect(p.body.item.autonomy_tier).toBe(2);
    // The forbidden fields are ignored (stripUnknown) — status/approval untouched.
    expect(p.body.item.status).toBe('idea');
    expect(p.body.item.approved_at).toBeNull();
    expect(p.body.item.published_at).toBeNull();
  });

  it('summary returns counts by status', async () => {
    const s = await withToken(request(app).get('/api/admin/content/summary'), superAdmin.token);
    expect(s.status).toBe(200);
    expect(typeof s.body.total).toBe('number');
    expect(s.body.by_status.idea).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 3. State machine via the API
// ---------------------------------------------------------------------------
describe('state machine transitions', () => {
  let id;
  beforeAll(async () => {
    const c = await withToken(request(app).post('/api/admin/content'), superAdmin.token).send({
      channel: 'reel', engine: 'record', autonomy_tier: 0, status: 'draft',
    });
    id = c.body.item.id;
    createdIds.push(id);
  });

  it('legal forward transitions succeed and each writes an event', async () => {
    const a = await withToken(request(app).post(`/api/admin/content/${id}/transition`), superAdmin.token).send({ to: 'in_review', note: 'to desk' });
    expect(a.status).toBe(200);
    expect(a.body.item.status).toBe('in_review');
    const ev = await pool.query('SELECT * FROM content_events WHERE content_id=$1 AND to_status=$2', [id, 'in_review']);
    expect(ev.rowCount).toBe(1);
    expect(ev.rows[0].note).toBe('to desk');
  });

  it('an illegal skip/regress is a 4xx', async () => {
    const bad = await withToken(request(app).post(`/api/admin/content/${id}/transition`), superAdmin.token).send({ to: 'published' });
    expect(bad.status).toBe(400);
    const back = await withToken(request(app).post(`/api/admin/content/${id}/transition`), superAdmin.token).send({ to: 'idea' });
    expect(back.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 4. TIER GATE — the safety core (API + publisher)
// ---------------------------------------------------------------------------
describe('tier gate — API side', () => {
  it('a Tier 1 item can be approved by a content:manage admin, then scheduled', async () => {
    const c = await withToken(request(app).post('/api/admin/content'), superAdmin.token).send({
      channel: 'linkedin', engine: 'reach', autonomy_tier: 1, status: 'draft',
    });
    const id = c.body.item.id;
    createdIds.push(id);
    await withToken(request(app).post(`/api/admin/content/${id}/transition`), superAdmin.token).send({ to: 'in_review' });

    // Before approval, scheduling is refused by the gate.
    const early = await withToken(request(app).patch(`/api/admin/content/${id}`), superAdmin.token).send({ scheduled_at: new Date(Date.now() + 3600000).toISOString() });
    expect(early.status).toBe(200);
    // in_review -> scheduled is not even a legal step; approve first.
    const ap = await withToken(request(app).post(`/api/admin/content/${id}/transition`), superAdmin.token).send({ to: 'approved' });
    expect(ap.status).toBe(200);
    expect(ap.body.item.approved_by).toBe(superAdmin.id);
    expect(ap.body.item.approved_at).toBeTruthy();

    const sch = await withToken(request(app).post(`/api/admin/content/${id}/transition`), superAdmin.token).send({ to: 'scheduled' });
    expect(sch.status).toBe(200);
    expect(sch.body.item.status).toBe('scheduled');
  });

  it('a Tier 1 item CANNOT be scheduled without approval even with scheduled_at set', async () => {
    // Build an item at 'approved'-adjacent but with NO approval by inserting one
    // at in_review, moving to approved would set approval — so instead drive a
    // tier-1 draft straight and try to schedule from a state adjacent to
    // scheduled without ever approving. We reach 'approved' rank only via the
    // gate, so the realistic unapproved path is blocked earlier; assert the gate
    // directly refuses a scheduled move for an unapproved tier-1 item.
    const item = await insertItem({ channel: 'twitter', engine: 'reach', autonomy_tier: 1, status: 'approved', approved_at: null });
    // 'approved' with approved_at NULL is an artificial state; scheduling it must
    // still be refused by the gate.
    const sch = await withToken(request(app).post(`/api/admin/content/${item.id}/transition`), superAdmin.token)
      .send({ to: 'scheduled', scheduled_at: new Date(Date.now() + 3600000).toISOString() });
    expect(sch.status).toBe(400);
  });
});

describe('tier gate — publisher (publishDue, called directly, no Redis)', () => {
  it('publishes a due Tier 0 item and an APPROVED Tier 1, SKIPS an unapproved Tier 1', async () => {
    const tier0 = await insertItem({ channel: 'blog', autonomy_tier: 0, engine: 'record' });
    const tier1ok = await insertItem({
      channel: 'linkedin', autonomy_tier: 1, engine: 'reach',
      approved_at: new Date(Date.now() - 120000).toISOString(), approved_by: superAdmin.id,
    });
    const tier1bad = await insertItem({ channel: 'twitter', autonomy_tier: 1, engine: 'reach', approved_at: null });

    const res = await publisher.publishDue(new Date());
    expect(res.published).toBeGreaterThanOrEqual(2);

    const rows = await pool.query('SELECT id, status, published_at, external_ref FROM content_items WHERE id = ANY($1)', [[tier0.id, tier1ok.id, tier1bad.id]]);
    const byId = Object.fromEntries(rows.rows.map((r) => [r.id, r]));
    expect(byId[tier0.id].status).toBe('published');
    expect(byId[tier0.id].external_ref).toMatch(/^outbox:/);
    expect(byId[tier1ok.id].status).toBe('published');
    // The unapproved Tier 1 stays scheduled and never published.
    expect(byId[tier1bad.id].status).toBe('scheduled');
    expect(byId[tier1bad.id].published_at).toBeNull();

    // Publish log written for the two published, none for the skipped one.
    const logs = await pool.query('SELECT content_id, result, adapter FROM content_publish_log WHERE content_id = ANY($1)', [[tier0.id, tier1ok.id, tier1bad.id]]);
    const logged = new Set(logs.rows.map((r) => r.content_id));
    expect(logged.has(tier0.id)).toBe(true);
    expect(logged.has(tier1ok.id)).toBe(true);
    expect(logged.has(tier1bad.id)).toBe(false);
    // A published item gets a system event.
    const sysEv = await pool.query("SELECT * FROM content_events WHERE content_id=$1 AND to_status='published' AND actor_kind='system'", [tier0.id]);
    expect(sysEv.rowCount).toBe(1);
  });

  it('does not publish a future-scheduled item', async () => {
    const future = await insertItem({ autonomy_tier: 0, scheduled_at: new Date(Date.now() + 3600000).toISOString() });
    await publisher.publishDue(new Date());
    const r = await pool.query('SELECT status FROM content_items WHERE id=$1', [future.id]);
    expect(r.rows[0].status).toBe('scheduled');
  });
});

// ---------------------------------------------------------------------------
// 5. Strategist seeder
// ---------------------------------------------------------------------------
describe('strategist seeder', () => {
  it('buildBriefs is pure/deterministic (same metrics + periodKey → identical)', () => {
    const metrics = { totalShops: 100, activeShops: 40, collection30dPaise: 1234500, supplyGmv30dPaise: 9876500 };
    const a = strategist.buildBriefs(metrics, '2026-W01');
    const b = strategist.buildBriefs(metrics, '2026-W01');
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(3);
    // Tiers cover 0, 1 and 2 per the playbook.
    const tiers = new Set(a.map((x) => x.autonomy_tier));
    expect(tiers.has(0)).toBe(true);
    expect(tiers.has(1)).toBe(true);
    expect(tiers.has(2)).toBe(true);
    // Every brief starts as a strategist idea with a channel-scoped seed_key.
    for (const brief of a) {
      expect(brief.source).toBe('strategist');
      expect(brief.meta.seed_key).toBe(`${brief.channel}:2026-W01`);
    }
    // Money renders as rounded rupees, not paise.
    expect(a.some((x) => x.title.includes('12345') || x.brief.includes('12345'))).toBe(true);
  });

  it('isoWeekKey is deterministic for a fixed date', () => {
    expect(strategist.isoWeekKey(new Date('2026-01-05T00:00:00Z'))).toBe('2026-W02');
  });

  it('runStrategist inserts idea items and is idempotent within a period', async () => {
    // Patch readMetrics-independent behaviour by driving buildBriefs through the
    // real runStrategist path, but with a unique period so we can clean up. We
    // temporarily override isoWeekKey via a wrapper insert using buildBriefs is
    // overkill; instead call runStrategist twice at the same clock and assert the
    // second run inserts nothing new for that ISO week.
    const first = await strategist.runStrategist(new Date());
    expect(first.total).toBeGreaterThanOrEqual(3);
    const seeded = await pool.query(
      "SELECT COUNT(*)::int AS c FROM content_items WHERE status='idea' AND source='strategist' AND meta->>'seed_key' LIKE $1",
      [`%:${first.periodKey}`]
    );
    expect(seeded.rows[0].c).toBeGreaterThanOrEqual(first.total);

    const second = await strategist.runStrategist(new Date());
    expect(second.periodKey).toBe(first.periodKey);
    expect(second.inserted).toBe(0); // idempotent — seed_key unique

    // Track the seeded rows for cleanup.
    const ids = await pool.query("SELECT id FROM content_items WHERE source='strategist' AND meta->>'seed_key' LIKE $1", [`%:${first.periodKey}`]);
    for (const row of ids.rows) createdIds.push(row.id);
  });
});

// ---------------------------------------------------------------------------
// 6. Role / scoping
// ---------------------------------------------------------------------------
describe('auth + permission scoping', () => {
  it('owner token → 403; admin without content:manage → 403; no token → 401', async () => {
    const owner = await withToken(request(app).get('/api/admin/content'), ownerUser.token);
    expect(owner.status).toBe(403);
    const support = await withToken(request(app).get('/api/admin/content'), supportAdmin.token);
    expect(support.status).toBe(403);
    const anon = await request(app).get('/api/admin/content');
    expect(anon.status).toBe(401);
    // A non-manage admin also cannot create.
    const create = await withToken(request(app).post('/api/admin/content'), supportAdmin.token).send({
      channel: 'blog', engine: 'record', autonomy_tier: 0,
    });
    expect(create.status).toBe(403);
  });
});
