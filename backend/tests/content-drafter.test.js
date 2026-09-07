// Tests for the LLM drafting agent (Batch R). NO real network is ever made — every
// path either injects a FAKE client (exposing messages.create) or exercises the
// unconfigured 400/false path. Requires a real Postgres (DATABASE_URL, migrations
// 0001..0030) for the runDraft + API cases. Covers:
//   1. buildRequest — pure/deterministic; the system prompt carries the guardrails
//      (no fabricated testimonials, no financial-advice framing) and names the
//      target language; the brief rides in the user message.
//   2. draftItem — with an injected fake client → returns the concatenated body.
//   3. runDraft — on an 'idea' item advances to 'draft' (source='agent', events
//      written) WITHOUT ever touching approved/scheduled/published (GATE INTACT);
//      on a non-idea/draft item → ApiError.
//   4. isConfigured() — false when the env is unset; POST /:id/draft → 400 when
//      unconfigured (no client built, no network).
//   5. Role/scoping on the draft route — owner 403, admin without content:manage
//      403, no token 401.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';
// Ensure the drafter reads as UNCONFIGURED for the whole suite (no key/model), so
// no real client is ever constructed and no network call is possible.
delete process.env.ANTHROPIC_API_KEY;
delete process.env.CONTENT_LLM_MODEL;

const app = require('../src/app');
const { pool } = require('../src/config/db');
const drafter = require('../src/services/content-drafter.service');

const uniq = Date.now().toString().slice(-9);
const withToken = (req, token) => req.set('Authorization', `Bearer ${token}`);
const adminToken = (id) => jwt.sign({ sub: id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '30d' });
const ownerToken = (id) => jwt.sign({ sub: id, role: 'owner' }, process.env.JWT_SECRET, { expiresIn: '30d' });

// A fake SDK client — resolves a fixed content-block array; NEVER touches the net.
const fakeClient = {
  messages: {
    create: async () => ({ content: [{ type: 'text', text: 'DRAFTED BODY' }] }),
  },
};

const emails = [];
const createdIds = [];
let superAdmin; // content:manage via super
let supportAdmin; // no content:manage
let ownerUser; // non-admin

async function makeUser(role, adminRole) {
  const email = `drafter_${role}_${adminRole || 'x'}_${uniq}@test.local`;
  emails.push(email);
  const r = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role, admin_role)
     VALUES ($1,$2,$3,'x',$4,$5) RETURNING id`,
    [`Drafter ${role}`, email, `+9172${uniq}${role.slice(0, 2)}`.slice(0, 15), role, adminRole || null]
  );
  return r.rows[0].id;
}

async function insertItem(over = {}) {
  const o = {
    channel: 'blog', engine: 'record', autonomy_tier: 1, language: 'en',
    title: 'A shopkeeper story', brief: 'Tell how the ledger surfaces overdue dues.',
    status: 'idea', source: 'strategist', ...over,
  };
  const r = await pool.query(
    `INSERT INTO content_items (channel, engine, autonomy_tier, language, title, brief, status, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [o.channel, o.engine, o.autonomy_tier, o.language, o.title, o.brief, o.status, o.source]
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
  await pool.query('DELETE FROM users WHERE email = ANY($1)', [emails]);
  await pool.end();
});

// ---------------------------------------------------------------------------
// 1. buildRequest — pure, guardrailed
// ---------------------------------------------------------------------------
describe('buildRequest (pure)', () => {
  const item = {
    channel: 'whatsapp_tip', engine: 'reach', autonomy_tier: 1, language: 'ta',
    title: 'Chase the oldest dues', brief: 'A warm WhatsApp tip: sort udhaar by age.',
  };

  it('is deterministic for the same item', () => {
    expect(drafter.buildRequest(item)).toEqual(drafter.buildRequest(item));
  });

  it('system prompt carries the hard guardrails and names the target language', () => {
    const { system } = drafter.buildRequest(item);
    const lower = system.toLowerCase();
    // No fabricated testimonials / stats.
    expect(lower).toContain('testimonial');
    expect(lower).toMatch(/never fabricate|do not invent|never (?:promise|invent)/);
    // No financial / credit advice framing.
    expect(lower).toContain('financial');
    expect(lower).toContain('credit advice');
    // Output only the body; a human reviews before publish.
    expect(lower).toContain('only the post body');
    expect(lower).toMatch(/human editor reviews/);
    // Names the item's target language.
    expect(system).toContain('ta');
  });

  it('the brief rides in the user message', () => {
    const { messages } = drafter.buildRequest(item);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toContain(item.brief);
  });
});

// ---------------------------------------------------------------------------
// 2. draftItem — injected fake client, no network
// ---------------------------------------------------------------------------
describe('draftItem (fake client)', () => {
  it('concatenates the text blocks and trims', async () => {
    const item = { channel: 'blog', engine: 'record', autonomy_tier: 0, language: 'en', brief: 'x' };
    const body = await drafter.draftItem(item, { client: fakeClient });
    expect(body).toBe('DRAFTED BODY');
  });

  it('throws when unconfigured and no client injected (no network)', async () => {
    const item = { channel: 'blog', engine: 'record', autonomy_tier: 0, language: 'en', brief: 'x' };
    await expect(drafter.draftItem(item)).rejects.toMatchObject({ status: 400 });
  });
});

// ---------------------------------------------------------------------------
// 3. runDraft — advances to draft, stays behind the human gate
// ---------------------------------------------------------------------------
describe('runDraft (fake client) — behind the human gate', () => {
  it('drafts an idea → draft with source=agent + events, leaving the gate columns null', async () => {
    const item = await insertItem({ status: 'idea', autonomy_tier: 1, source: 'strategist' });
    const out = await drafter.runDraft(item.id, { client: fakeClient });

    expect(out.status).toBe('draft');
    expect(out.body).toBe('DRAFTED BODY');
    expect(out.source).toBe('agent');
    // The human gate is UNTOUCHED — nothing approved/scheduled/published.
    expect(out.approved_at).toBeNull();
    expect(out.approved_by).toBeNull();
    expect(out.scheduled_at).toBeNull();
    expect(out.published_at).toBeNull();

    // idea→drafting and drafting→draft are recorded as agent events.
    const ev = await pool.query(
      "SELECT from_status, to_status, actor_kind FROM content_events WHERE content_id=$1 ORDER BY created_at",
      [item.id]
    );
    const pairs = ev.rows.map((r) => `${r.from_status}->${r.to_status}`);
    expect(pairs).toContain('idea->drafting');
    expect(pairs).toContain('drafting->draft');
    expect(ev.rows.every((r) => r.actor_kind === 'agent')).toBe(true);
  });

  it('resumes a parked drafting item to draft (the API-route path)', async () => {
    const item = await insertItem({ status: 'drafting', autonomy_tier: 1 });
    const out = await drafter.runDraft(item.id, { client: fakeClient });
    expect(out.status).toBe('draft');
    expect(out.body).toBe('DRAFTED BODY');
  });

  it('refuses a non-idea/draft item with an ApiError', async () => {
    const item = await insertItem({ status: 'in_review', autonomy_tier: 1 });
    await expect(drafter.runDraft(item.id, { client: fakeClient })).rejects.toMatchObject({ status: 400 });
  });
});

// ---------------------------------------------------------------------------
// 4. Config gating — unconfigured → false + 400
// ---------------------------------------------------------------------------
describe('config gating', () => {
  it('isConfigured() is false when the env is unset', () => {
    expect(drafter.isConfigured()).toBe(false);
  });

  it('GET /config reports ai_drafting=false', async () => {
    const r = await withToken(request(app).get('/api/admin/content/config'), superAdmin.token);
    expect(r.status).toBe(200);
    expect(r.body.ai_drafting).toBe(false);
  });

  it('POST /:id/draft → 400 when unconfigured (no client, no network)', async () => {
    const item = await insertItem({ status: 'idea' });
    const r = await withToken(request(app).post(`/api/admin/content/${item.id}/draft`), superAdmin.token);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('AI drafting is not configured');
    // The item was NOT advanced (no drafting side-effect on the gated failure).
    const cur = await pool.query('SELECT status FROM content_items WHERE id=$1', [item.id]);
    expect(cur.rows[0].status).toBe('idea');
  });
});

// ---------------------------------------------------------------------------
// 5. Role / scoping on the draft route
// ---------------------------------------------------------------------------
describe('auth + permission scoping on /draft', () => {
  it('owner → 403; admin without content:manage → 403; no token → 401', async () => {
    const item = await insertItem({ status: 'idea' });
    const owner = await withToken(request(app).post(`/api/admin/content/${item.id}/draft`), ownerUser.token);
    expect(owner.status).toBe(403);
    const support = await withToken(request(app).post(`/api/admin/content/${item.id}/draft`), supportAdmin.token);
    expect(support.status).toBe(403);
    const anon = await request(app).post(`/api/admin/content/${item.id}/draft`);
    expect(anon.status).toBe(401);
  });
});
