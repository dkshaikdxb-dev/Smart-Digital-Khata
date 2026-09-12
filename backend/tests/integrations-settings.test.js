// Batch INTEG — every integration credential configurable from Admin -> Settings
// through the ONE config/settings pattern (platform_settings overrides .env),
// guarded by a typed "I CONFIRM" the BACKEND enforces. Covers:
//   1. the 428 confirmation_required guard (nothing written, all-or-nothing);
//   2. secrets: set -> *_set true and never echoed; blank keeps; null clears;
//   3. the .env fallback + source(), and a DB value overriding env;
//   4. moderation/drafter getClient() re-creating the SDK client on key change;
//   5. the settings.integrations_update audit row (key NAMES only);
//   6. /ai/test and /smtp/test gating (400 not_configured, 403 without the perm).
// Requires a real Postgres (DATABASE_URL) with migrations applied. Never touches
// the network: the vendor SDK is mocked below.
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

// Start UNCONFIGURED whatever the shell carries.
for (const k of ['ANTHROPIC_API_KEY', 'MODERATION_LLM_MODEL', 'CONTENT_LLM_MODEL', 'META_APP_ID',
  'META_APP_SECRET', 'META_PAGE_TOKEN', 'META_IG_TOKEN', 'SMTP_URL', 'SMTP_HOST', 'SMTP_PORT',
  'SMTP_USER', 'SMTP_PASS', 'SMTP_SECURE', 'NEWSLETTER_FROM', 'BHASHINI_NMT', 'BHASHINI_API_KEY',
  'BHASHINI_USER_ID', 'SARVAM_API_KEY']) {
  delete process.env[k];
}

// The vendor SDK is replaced by a constructor spy: it records the apiKey each
// instance was built with and never makes a request.
const mockConstructed = [];
jest.mock('@anthropic-ai/sdk', () => {
  class FakeSdkClient {
    constructor(opts) {
      mockConstructed.push(opts && opts.apiKey);
      this.messages = { create: async () => ({ content: [{ type: 'text', text: 'OK' }] }) };
    }
  }
  return FakeSdkClient;
});

const app = require('../src/app');
const { pool } = require('../src/config/db');
const settings = require('../src/config/settings');
const drafter = require('../src/services/content-drafter.service');
const moderation = require('../src/services/moderation.service');
const newsletter = require('../src/services/content-newsletter.service');

const uniq = Date.now().toString().slice(-9);
const withToken = (req, token) => req.set('Authorization', `Bearer ${token}`);
const tokenFor = (id) => jwt.sign({ sub: id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '30d' });

const CONFIRM = 'I CONFIRM';
const SECRET = `sk-test-secret-${uniq}-never-echoed`;

let superAdmin;
let support;

async function makeAdmin(role, seed) {
  const r = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role, admin_role)
     VALUES ($1,$2,$3,'x','admin',$4) RETURNING id`,
    [`INTEG ${role}`, `integ_${role}_${uniq}@test.local`, `+91${seed}${uniq}`, role]
  );
  return { id: r.rows[0].id, token: tokenFor(r.rows[0].id) };
}

const getSettings = () => withToken(request(app).get('/api/admin/settings'), superAdmin.token);
const patch = (body, token = superAdmin.token) =>
  withToken(request(app).patch('/api/admin/settings'), token).send(body);

async function dbValue(key) {
  const r = await pool.query('SELECT value FROM platform_settings WHERE key = $1', [key]);
  return r.rows[0] ? r.rows[0].value : null;
}

beforeAll(async () => {
  superAdmin = await makeAdmin('super', '71');
  support = await makeAdmin('support', '72');
});

afterAll(async () => {
  // Leave no integration credential behind for the next suite.
  await pool.query('DELETE FROM platform_settings WHERE key = ANY($1)', [[...settings.INTEGRATION_KEYS]]);
  await pool.query("DELETE FROM moderation_actions WHERE action = 'settings.integrations_update' AND admin_user_id = $1", [superAdmin.id]);
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [[superAdmin.id, support.id]]);
  // Restore the seeded default touched by the all-or-nothing test.
  await pool.query(
    `INSERT INTO platform_settings (key, value, updated_at) VALUES ('voice_assistant_enabled','true',NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`
  );
  await pool.end();
});

// ---------------------------------------------------------------------------
// 0. GET shape
// ---------------------------------------------------------------------------
describe('GET /api/admin/settings — integrations block', () => {
  it('exposes ai / meta / smtp / nmt with *_set booleans and sources, never a value', async () => {
    const res = await getSettings();
    expect(res.status).toBe(200);
    const i = res.body.integrations;
    expect(i).toBeDefined();
    expect(i.ai).toMatchObject({ api_key_set: false, api_key_source: 'none', moderation_configured: false, content_configured: false });
    expect(i.meta).toMatchObject({ app_secret_set: false, page_token_set: false, ig_token_set: false, facebook_configured: false, instagram_configured: false });
    expect(i.smtp).toMatchObject({ url_set: false, pass_set: false, configured: false });
    expect(i.nmt).toMatchObject({ enabled: false, bhashini_key_set: false, sarvam_key_set: false, adapter_wired: false });
    // The existing features line is kept.
    expect(res.body.features).toHaveProperty('ai_moderation_configured', false);
    // Exported key lists are frozen and consistent.
    expect(Object.isFrozen(settings.INTEGRATION_KEYS)).toBe(true);
    expect(settings.INTEGRATION_KEYS).toEqual(expect.arrayContaining(['RAZORPAY_KEY_SECRET', 'WHATSAPP_API_TOKEN', 'ANTHROPIC_API_KEY', 'SMTP_PASS', 'SARVAM_API_KEY']));
    for (const k of settings.SECRET_KEYS) expect(settings.INTEGRATION_KEYS).toContain(k);
  });
});

// ---------------------------------------------------------------------------
// 1. The typed confirmation guard (server-side)
// ---------------------------------------------------------------------------
describe('PATCH /api/admin/settings — typed confirmation guard', () => {
  it('an integration key without confirm → 428 and NOTHING written (the toggle in the same body too)', async () => {
    const before = await getSettings();
    const toggleBefore = before.body.features.voice_assistant_enabled;

    const res = await patch({ moderation_llm_model: `mod-model-${uniq}`, voice_assistant_enabled: !toggleBefore });
    expect(res.status).toBe(428);
    expect(res.body.error).toBe('confirmation_required');

    const after = await getSettings();
    expect(after.body.integrations.ai.moderation_model).toBe(before.body.integrations.ai.moderation_model);
    expect(after.body.features.voice_assistant_enabled).toBe(toggleBefore);
    expect(await dbValue('MODERATION_LLM_MODEL')).toBeNull();
  });

  it('wrong case ("i confirm") → 428; exact "I CONFIRM" → written', async () => {
    const bad = await patch({ moderation_llm_model: `mod-model-${uniq}`, confirm: 'i confirm' });
    expect(bad.status).toBe(428);
    expect(await dbValue('MODERATION_LLM_MODEL')).toBeNull();

    const ok = await patch({ moderation_llm_model: `mod-model-${uniq}`, confirm: `  ${CONFIRM}  ` });
    expect(ok.status).toBe(200);
    const g = await getSettings();
    expect(g.body.integrations.ai.moderation_model).toBe(`mod-model-${uniq}`);
    expect(g.body.integrations.ai.moderation_model_source).toBe('db');
    expect(await dbValue('MODERATION_LLM_MODEL')).toBe(`mod-model-${uniq}`);
  });

  it('the existing Razorpay / WhatsApp keys are guarded too', async () => {
    const res = await patch({ razorpay_key_id: 'rzp_test_x' });
    expect(res.status).toBe(428);
    const res2 = await patch({ whatsapp_api_token: 'EAA-x' });
    expect(res2.status).toBe(428);
  });

  it('a body touching no integration key needs no confirm (unchanged behaviour)', async () => {
    const before = (await getSettings()).body.features.voice_assistant_enabled;
    const res = await patch({ voice_assistant_enabled: before });
    expect(res.status).toBe(200);
  });

  it('rejects a bad model id (whitespace / too long) and a bad SMTP port', async () => {
    expect((await patch({ content_llm_model: 'has space', confirm: CONFIRM })).status).toBe(400);
    expect((await patch({ content_llm_model: 'x'.repeat(121), confirm: CONFIRM })).status).toBe(400);
    expect((await patch({ smtp_port: 70000, confirm: CONFIRM })).status).toBe(400);
    expect((await patch({ smtp_port: 'abc', confirm: CONFIRM })).status).toBe(400);
    expect((await patch({ smtp_port: '', confirm: CONFIRM })).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 2. Secrets: set / keep / clear — never echoed
// ---------------------------------------------------------------------------
describe('secrets', () => {
  it('set → *_set true and the value is never returned; blank keeps; null clears', async () => {
    const set = await patch({ anthropic_api_key: SECRET, meta_app_secret: SECRET, confirm: CONFIRM });
    expect(set.status).toBe(200);
    let g = await getSettings();
    expect(g.body.integrations.ai.api_key_set).toBe(true);
    expect(g.body.integrations.ai.api_key_source).toBe('db');
    expect(g.body.integrations.meta.app_secret_set).toBe(true);
    expect(JSON.stringify(g.body)).not.toContain(SECRET);

    // Blank = keep.
    expect((await patch({ anthropic_api_key: '', confirm: CONFIRM })).status).toBe(200);
    g = await getSettings();
    expect(g.body.integrations.ai.api_key_set).toBe(true);
    expect(await dbValue('ANTHROPIC_API_KEY')).toBe(SECRET);

    // null = clear → source falls back to none (no env here).
    expect((await patch({ anthropic_api_key: null, meta_app_secret: null, confirm: CONFIRM })).status).toBe(200);
    g = await getSettings();
    expect(g.body.integrations.ai.api_key_set).toBe(false);
    expect(g.body.integrations.ai.api_key_source).toBe('none');
    expect(g.body.integrations.meta.app_secret_set).toBe(false);
    expect(await dbValue('ANTHROPIC_API_KEY')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 3. ENV fallback + DB override
// ---------------------------------------------------------------------------
describe('env fallback through settings.get / source', () => {
  afterEach(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CONTENT_LLM_MODEL;
    await patch({ content_llm_model: '', anthropic_api_key: null, confirm: CONFIRM });
  });

  it('with the env set and the DB empty, source = env and the drafter honours it; a DB value overrides', async () => {
    process.env.ANTHROPIC_API_KEY = `env-key-${uniq}`;
    process.env.CONTENT_LLM_MODEL = `env-model-${uniq}`;
    expect(settings.source('CONTENT_LLM_MODEL')).toBe('env');
    expect(settings.get('CONTENT_LLM_MODEL')).toBe(`env-model-${uniq}`);
    expect(drafter.isConfigured()).toBe(true);

    let g = await getSettings();
    expect(g.body.integrations.ai.content_model).toBe(`env-model-${uniq}`);
    expect(g.body.integrations.ai.content_model_source).toBe('env');
    expect(g.body.integrations.ai.api_key_source).toBe('env');
    expect(g.body.integrations.ai.content_configured).toBe(true);
    expect(JSON.stringify(g.body)).not.toContain(`env-key-${uniq}`);

    // A DB value overrides the env.
    expect((await patch({ content_llm_model: `db-model-${uniq}`, confirm: CONFIRM })).status).toBe(200);
    expect(settings.source('CONTENT_LLM_MODEL')).toBe('db');
    expect(settings.get('CONTENT_LLM_MODEL')).toBe(`db-model-${uniq}`);
    g = await getSettings();
    expect(g.body.integrations.ai.content_model).toBe(`db-model-${uniq}`);

    // Clearing the DB value ('') falls back to the env again.
    expect((await patch({ content_llm_model: '', confirm: CONFIRM })).status).toBe(200);
    expect(settings.source('CONTENT_LLM_MODEL')).toBe('env');
    expect(settings.get('CONTENT_LLM_MODEL')).toBe(`env-model-${uniq}`);
  });
});

// ---------------------------------------------------------------------------
// 4. getClient() re-creates the SDK client when the key changes
// ---------------------------------------------------------------------------
describe('getClient() cache keyed by the API key', () => {
  afterAll(async () => {
    await patch({ anthropic_api_key: null, content_llm_model: '', moderation_llm_model: '', confirm: CONFIRM });
  });

  it('drafter + moderation build a fresh client after a key rotation, and reuse it otherwise', async () => {
    mockConstructed.length = 0;
    expect(drafter.getClient()).toBeNull(); // unconfigured → no client, no construction
    expect(mockConstructed).toHaveLength(0);

    const keyA = `key-A-${uniq}`;
    const keyB = `key-B-${uniq}`;
    expect((await patch({
      anthropic_api_key: keyA, content_llm_model: 'm-content', moderation_llm_model: 'm-mod', confirm: CONFIRM,
    })).status).toBe(200);

    const d1 = drafter.getClient();
    const d1again = drafter.getClient();
    expect(d1).toBeTruthy();
    expect(d1again).toBe(d1); // same key → cached instance reused
    const m1 = moderation.getClient();
    expect(m1).toBeTruthy();
    expect(mockConstructed).toEqual([keyA, keyA]); // one per service

    expect((await patch({ anthropic_api_key: keyB, confirm: CONFIRM })).status).toBe(200);
    const d2 = drafter.getClient();
    const m2 = moderation.getClient();
    expect(d2).not.toBe(d1);
    expect(m2).not.toBe(m1);
    expect(mockConstructed).toEqual([keyA, keyA, keyB, keyB]);
    // The key is passed to the SDK and never logged/returned by the API.
    const g = await getSettings();
    expect(JSON.stringify(g.body)).not.toContain(keyB);
  });
});

// ---------------------------------------------------------------------------
// 5. Audit — key NAMES only
// ---------------------------------------------------------------------------
describe('audit trail', () => {
  it('writes settings.integrations_update with the changed key names and never a value', async () => {
    const before = await pool.query(
      "SELECT COUNT(*)::int AS c FROM moderation_actions WHERE action = 'settings.integrations_update' AND admin_user_id = $1",
      [superAdmin.id]
    );
    const modelId = `audited-model-${uniq}`;
    expect((await patch({ anthropic_api_key: SECRET, moderation_llm_model: modelId, meta_page_token: null, confirm: CONFIRM })).status).toBe(200);

    const r = await pool.query(
      `SELECT action, target_type, metadata FROM moderation_actions
        WHERE action = 'settings.integrations_update' AND admin_user_id = $1
        ORDER BY created_at DESC LIMIT 1`,
      [superAdmin.id]
    );
    expect(r.rowCount).toBe(1);
    const row = r.rows[0];
    expect(row.target_type).toBe('settings');
    expect(row.metadata.keys).toEqual(expect.arrayContaining(['ANTHROPIC_API_KEY', 'MODERATION_LLM_MODEL', 'META_PAGE_TOKEN']));
    expect(row.metadata.cleared).toEqual(['META_PAGE_TOKEN']);
    const meta = JSON.stringify(row.metadata);
    expect(meta).not.toContain(SECRET);
    expect(meta).not.toContain(modelId);

    const after = await pool.query(
      "SELECT COUNT(*)::int AS c FROM moderation_actions WHERE action = 'settings.integrations_update' AND admin_user_id = $1",
      [superAdmin.id]
    );
    expect(after.rows[0].c).toBe(before.rows[0].c + 1);

    // A refused (428) body writes no audit row either.
    expect((await patch({ moderation_llm_model: 'x' })).status).toBe(428);
    const after2 = await pool.query(
      "SELECT COUNT(*)::int AS c FROM moderation_actions WHERE action = 'settings.integrations_update' AND admin_user_id = $1",
      [superAdmin.id]
    );
    expect(after2.rows[0].c).toBe(after.rows[0].c);

    await patch({ anthropic_api_key: null, moderation_llm_model: '', confirm: CONFIRM });
  });
});

// ---------------------------------------------------------------------------
// 6. Test endpoints — gating
// ---------------------------------------------------------------------------
describe('POST /settings/ai/test and /settings/smtp/test', () => {
  it('→ 400 not_configured when unset', async () => {
    expect(drafter.isConfigured()).toBe(false);
    expect(newsletter.isConfigured()).toBe(false);
    const ai = await withToken(request(app).post('/api/admin/settings/ai/test'), superAdmin.token);
    expect(ai.status).toBe(400);
    expect(ai.body.error).toBe('not_configured');
    const smtp = await withToken(request(app).post('/api/admin/settings/smtp/test'), superAdmin.token);
    expect(smtp.status).toBe(400);
    expect(smtp.body.error).toBe('not_configured');
  });

  it('→ 403 for an admin without settings:manage (same gate as the razorpay test)', async () => {
    for (const path of ['/api/admin/settings/ai/test', '/api/admin/settings/smtp/test', '/api/admin/settings/razorpay/test']) {
      const r = await withToken(request(app).post(path), support.token);
      expect(r.status).toBe(403);
    }
    // ...and the PATCH itself.
    const p = await patch({ moderation_llm_model: 'x', confirm: CONFIRM }, support.token);
    expect(p.status).toBe(403);
  });

  it('nmt: the toggle stores "1"/"" and the provider keys are badge-only (adapter_wired false)', async () => {
    expect((await patch({ bhashini_nmt: true, bhashini_api_key: SECRET, bhashini_user_id: 'user-1', sarvam_api_key: SECRET, confirm: CONFIRM })).status).toBe(200);
    expect(await dbValue('BHASHINI_NMT')).toBe('1');
    let g = await getSettings();
    expect(g.body.integrations.nmt).toMatchObject({ enabled: true, bhashini_key_set: true, bhashini_user_id: 'user-1', sarvam_key_set: true, adapter_wired: false });
    expect(JSON.stringify(g.body)).not.toContain(SECRET);
    expect((await patch({ bhashini_nmt: false, bhashini_api_key: null, sarvam_api_key: null, bhashini_user_id: '', confirm: CONFIRM })).status).toBe(200);
    expect(await dbValue('BHASHINI_NMT')).toBe('');
    g = await getSettings();
    expect(g.body.integrations.nmt).toMatchObject({ enabled: false, bhashini_key_set: false, sarvam_key_set: false });
  });

  it('smtp: host/port/from make it configured; the transport is rebuilt when a value changes', async () => {
    expect((await patch({ smtp_host: 'smtp.example.test', smtp_port: 587, newsletter_from: `news_${uniq}@test.local`, smtp_secure: false, confirm: CONFIRM })).status).toBe(200);
    let g = await getSettings();
    expect(g.body.integrations.smtp).toMatchObject({ host: 'smtp.example.test', port: '587', secure: false, configured: true });
    expect(newsletter.isConfigured()).toBe(true);
    const t1 = newsletter.getTransport();
    expect(t1).toBeTruthy();
    expect(newsletter.getTransport()).toBe(t1);
    expect((await patch({ smtp_port: 2525, confirm: CONFIRM })).status).toBe(200);
    expect(newsletter.getTransport()).not.toBe(t1);
    expect((await patch({ smtp_host: '', smtp_port: '', newsletter_from: '', confirm: CONFIRM })).status).toBe(200);
    g = await getSettings();
    expect(g.body.integrations.smtp.configured).toBe(false);
    expect(newsletter.getTransport()).toBeNull();
  });
});
