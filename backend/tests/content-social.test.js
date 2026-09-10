// Real LinkedIn + X (Twitter) social publishers via OAuth (Batch S). NO real
// network is EVER made — every path injects a mock httpFetch or exercises a
// state-reject path that returns before any exchange. Requires a real Postgres
// (DATABASE_URL, migrations 0001..0031). Covers:
//   1. token-crypto: encrypt→decrypt round-trip; a tampered ciphertext throws
//      (GCM auth); no key → encrypt throws + isConfigured false.
//   2. OAuth start: single-use state row (expiry + created_by); authorize_url
//      carries client_id/redirect_uri/scope/state (+ PKCE S256 for X); 400 when
//      not oauth-configured.
//   3. OAuth callback: a VALID state stores an account with ENCRYPTED tokens
//      (stored != plaintext, decrypts back), burns the state (single-use); an
//      UNKNOWN/expired/REUSED state → 400 and NO account (CSRF). No token leaks.
//   4. Adapters: linkedin/twitter send success + error; the X 280 guard (no POST);
//      the token-refresh path (expired → refresh → new token persisted encrypted).
//   5. publishDue: connected → real adapter + real adapter name logged; no
//      connection → outbox; tier gate SKIPS unapproved Tier 1; a failed send
//      clears publish_started_at + increments publish_attempts (claim→send→finalize).
//   6. Role/scoping: start/accounts/disconnect require content:manage (owner 403,
//      no token 401); the callback is public but state-gated (invalid → 400).
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';
// A deterministic 32-byte test key (64 hex chars) + app credentials, so the
// social channels read as oauth-configured in THIS worker. token-crypto and the
// social service read these from the environment lazily.
process.env.CONTENT_TOKEN_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
process.env.PUBLIC_BASE_URL = 'https://khata.test.local';
process.env.LINKEDIN_CLIENT_ID = 'li_client_id';
process.env.LINKEDIN_CLIENT_SECRET = 'li_client_secret';
process.env.TWITTER_CLIENT_ID = 'x_client_id';
process.env.TWITTER_CLIENT_SECRET = 'x_client_secret';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const tokenCrypto = require('../src/utils/token-crypto');
const social = require('../src/services/content-social.service');
const meta = require('../src/services/content-meta.service');
const publisher = require('../src/services/content-publisher.service');

const uniq = Date.now().toString().slice(-9);
const withToken = (req, token) => req.set('Authorization', `Bearer ${token}`);
const adminToken = (id) => jwt.sign({ sub: id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '30d' });
const ownerToken = (id) => jwt.sign({ sub: id, role: 'owner' }, process.env.JWT_SECRET, { expiresIn: '30d' });

const emails = [];
const createdIds = [];
let superAdmin;
let ownerUser;

async function makeUser(role, adminRole) {
  const email = `social_${role}_${adminRole || 'x'}_${uniq}@test.local`;
  emails.push(email);
  const r = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role, admin_role)
     VALUES ($1,$2,$3,'x',$4,$5) RETURNING id`,
    [`Social ${role}`, email, `+9172${uniq}${role.slice(0, 2)}`.slice(0, 15), role, adminRole || null]
  );
  return r.rows[0].id;
}

// A fetch-like Response for the mock. `json`/`text` and an optional header map.
function mockRes({ ok = true, status = 200, json, text, headers }) {
  return {
    ok,
    status,
    async json() { if (json === undefined) throw new Error('no json body'); return json; },
    async text() { return text !== undefined ? text : ''; },
    headers: { get: (k) => (headers ? headers[String(k).toLowerCase()] || null : null) },
  };
}

// A mock httpFetch dispatching on a substring of the URL. Records calls so tests
// can assert that (e.g.) no publish POST happened.
function fetchMock(routes) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    for (const [match, res] of routes) {
      if (String(url).includes(match)) return typeof res === 'function' ? res(url, opts) : res;
    }
    throw new Error(`unexpected fetch to ${url}`);
  };
  fn.calls = calls;
  return fn;
}

async function insertItem(over = {}) {
  const o = {
    channel: 'twitter', engine: 'reach', autonomy_tier: 0, language: 'en',
    title: 'T', body: 'hello world', status: 'scheduled',
    scheduled_at: new Date(Date.now() - 60000).toISOString(),
    approved_at: null, approved_by: null, source: 'human',
    ...over,
  };
  const r = await pool.query(
    `INSERT INTO content_items (channel, engine, autonomy_tier, language, title, body, status, scheduled_at, approved_at, approved_by, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [o.channel, o.engine, o.autonomy_tier, o.language, o.title, o.body, o.status, o.scheduled_at, o.approved_at, o.approved_by, o.source]
  );
  createdIds.push(r.rows[0].id);
  return r.rows[0];
}

// Insert an active connected account with an encrypted token. `expired` makes the
// token past-due so the refresh path engages.
async function connectAccount(channel, { access = 'access_tok', refresh = 'refresh_tok', expired = false, extId = 'ext_1', name = 'Test Account' } = {}) {
  await pool.query(`UPDATE content_channel_accounts SET is_active=false WHERE channel=$1 AND is_active=true`, [channel]);
  const expiresAt = new Date(Date.now() + (expired ? -3600000 : 3600000)).toISOString();
  const r = await pool.query(
    `INSERT INTO content_channel_accounts
       (channel, external_account_id, display_name, access_token_enc, refresh_token_enc, token_expires_at, scope, is_active, connected_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,true,NULL) RETURNING *`,
    [channel, extId, name, tokenCrypto.encrypt(access), refresh ? tokenCrypto.encrypt(refresh) : null, expiresAt, 'scope', ]
  );
  return r.rows[0];
}

async function clearAccounts() {
  await pool.query(`DELETE FROM content_channel_accounts WHERE channel IN ('linkedin','twitter')`);
}

beforeAll(async () => {
  superAdmin = { id: await makeUser('admin', 'super') };
  superAdmin.token = adminToken(superAdmin.id);
  ownerUser = { id: await makeUser('owner', null) };
  ownerUser.token = ownerToken(ownerUser.id);
  await clearAccounts();
});

afterAll(async () => {
  if (createdIds.length) {
    await pool.query('DELETE FROM content_items WHERE id = ANY($1)', [createdIds]);
  }
  await clearAccounts();
  await pool.query('DELETE FROM content_oauth_states WHERE created_by = $1 OR created_by IS NULL', [superAdmin.id]);
  await pool.query('DELETE FROM users WHERE email = ANY($1)', [emails]);
  await pool.end();
});

// ---------------------------------------------------------------------------
// 1. token-crypto
// ---------------------------------------------------------------------------
describe('token-crypto (AES-256-GCM)', () => {
  it('encrypt → decrypt round-trips and produces versioned ciphertext', () => {
    const plain = 'super-secret-oauth-token-xyz';
    const enc = tokenCrypto.encrypt(plain);
    expect(enc.startsWith('v1:')).toBe(true);
    expect(enc).not.toContain(plain);
    expect(tokenCrypto.decrypt(enc)).toBe(plain);
  });

  it('a tampered ciphertext throws (GCM tag verification)', () => {
    const enc = tokenCrypto.encrypt('token-to-tamper');
    const parts = enc.split(':');
    // Flip a byte in the ciphertext segment.
    const ctBuf = Buffer.from(parts[3], 'base64');
    ctBuf[0] = ctBuf[0] ^ 0xff;
    const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${ctBuf.toString('base64')}`;
    expect(() => tokenCrypto.decrypt(tampered)).toThrow();
  });

  it('with no key: isConfigured false and encrypt throws', () => {
    const saved = process.env.CONTENT_TOKEN_KEY;
    delete process.env.CONTENT_TOKEN_KEY;
    try {
      expect(tokenCrypto.isConfigured()).toBe(false);
      expect(() => tokenCrypto.encrypt('x')).toThrow();
    } finally {
      process.env.CONTENT_TOKEN_KEY = saved;
    }
  });
});

// ---------------------------------------------------------------------------
// 2. OAuth start
// ---------------------------------------------------------------------------
describe('OAuth start', () => {
  it('LinkedIn start: creates a single-use state row and a valid authorize_url', async () => {
    const res = await withToken(request(app).get('/api/admin/content/oauth/linkedin/start'), superAdmin.token);
    expect(res.status).toBe(200);
    const url = res.body.authorize_url;
    expect(url).toContain('https://www.linkedin.com/oauth/v2/authorization');
    expect(url).toContain('client_id=li_client_id');
    expect(url).toContain(encodeURIComponent('https://khata.test.local/api/admin/content/oauth/linkedin/callback'));
    expect(url).toContain('w_member_social');
    const state = new URL(url).searchParams.get('state');
    expect(state).toHaveLength(64); // 32 bytes hex
    const row = await pool.query('SELECT * FROM content_oauth_states WHERE state=$1', [state]);
    expect(row.rowCount).toBe(1);
    expect(row.rows[0].created_by).toBe(superAdmin.id);
    expect(new Date(row.rows[0].expires_at).getTime()).toBeGreaterThan(Date.now());
    // <= 10 min TTL.
    expect(new Date(row.rows[0].expires_at).getTime()).toBeLessThanOrEqual(Date.now() + 10 * 60 * 1000 + 1000);
  });

  it('X start: authorize_url carries PKCE code_challenge + S256', async () => {
    const res = await withToken(request(app).get('/api/admin/content/oauth/twitter/start'), superAdmin.token);
    expect(res.status).toBe(200);
    const url = new URL(res.body.authorize_url);
    expect(url.origin + url.pathname).toBe('https://twitter.com/i/oauth2/authorize');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    // The verifier is stored with the state, never in the URL.
    const state = url.searchParams.get('state');
    const row = await pool.query('SELECT code_verifier FROM content_oauth_states WHERE state=$1', [state]);
    expect(row.rows[0].code_verifier).toBeTruthy();
    expect(url.searchParams.has('code_verifier')).toBe(false);
  });

  it('start → 400 when the channel is not oauth-configured', async () => {
    const saved = process.env.LINKEDIN_CLIENT_SECRET;
    delete process.env.LINKEDIN_CLIENT_SECRET;
    try {
      const res = await withToken(request(app).get('/api/admin/content/oauth/linkedin/start'), superAdmin.token);
      expect(res.status).toBe(400);
    } finally {
      process.env.LINKEDIN_CLIENT_SECRET = saved;
    }
  });
});

// ---------------------------------------------------------------------------
// 3. OAuth callback
// ---------------------------------------------------------------------------
describe('OAuth callback', () => {
  afterEach(async () => { await clearAccounts(); });

  it('a VALID state stores an account with ENCRYPTED tokens and burns the state', async () => {
    const { authorize_url: url } = await social.startOAuth('linkedin', superAdmin.id);
    const state = new URL(url).searchParams.get('state');

    const httpFetch = fetchMock([
      ['oauth/v2/accessToken', mockRes({ json: { access_token: 'LI_ACCESS', refresh_token: 'LI_REFRESH', expires_in: 3600, scope: 'openid profile w_member_social' } })],
      ['v2/userinfo', mockRes({ json: { sub: 'li_sub_9', name: 'Dada Shaik' } })],
    ]);

    const out = await social.handleCallback('linkedin', { code: 'auth_code_1', state, httpFetch });
    expect(out.ok).toBe(true);

    const acct = await pool.query(`SELECT * FROM content_channel_accounts WHERE channel='linkedin' AND is_active=true`);
    expect(acct.rowCount).toBe(1);
    const row = acct.rows[0];
    expect(row.external_account_id).toBe('li_sub_9');
    expect(row.display_name).toBe('Dada Shaik');
    expect(row.connected_by).toBe(superAdmin.id);
    // Stored ciphertext is NOT the plaintext, and decrypts back to it.
    expect(row.access_token_enc).not.toContain('LI_ACCESS');
    expect(tokenCrypto.decrypt(row.access_token_enc)).toBe('LI_ACCESS');
    expect(tokenCrypto.decrypt(row.refresh_token_enc)).toBe('LI_REFRESH');

    // Single-use: the state row is gone.
    const s = await pool.query('SELECT 1 FROM content_oauth_states WHERE state=$1', [state]);
    expect(s.rowCount).toBe(0);

    // The accounts API leaks no token field.
    const list = await withToken(request(app).get('/api/admin/content/accounts'), superAdmin.token);
    expect(list.status).toBe(200);
    const view = list.body.accounts.find((a) => a.channel === 'linkedin');
    expect(view).toBeTruthy();
    expect(JSON.stringify(view)).not.toContain('LI_ACCESS');
    expect(JSON.stringify(view)).not.toContain('LI_REFRESH');
    // No token-VALUE field is exposed (token_expires_at, a timestamp, is fine).
    for (const k of Object.keys(view)) {
      expect(k).not.toMatch(/access_token|refresh_token|_enc$/i);
    }
  });

  it('an UNKNOWN state → 400 via the public callback and stores NO account', async () => {
    const res = await request(app).get('/api/admin/content/oauth/linkedin/callback?code=x&state=deadbeefunknown');
    expect(res.status).toBe(400);
    const acct = await pool.query(`SELECT COUNT(*)::int c FROM content_channel_accounts WHERE channel='linkedin' AND is_active=true`);
    expect(acct.rows[0].c).toBe(0);
  });

  it('a REUSED state → rejected the second time (single-use, CSRF)', async () => {
    const { authorize_url: url } = await social.startOAuth('twitter', superAdmin.id);
    const state = new URL(url).searchParams.get('state');
    const httpFetch = fetchMock([
      ['oauth2/token', mockRes({ json: { access_token: 'X_A', refresh_token: 'X_R', expires_in: 7200, scope: 'tweet.write' } })],
      ['users/me', mockRes({ json: { data: { id: 'x_1', name: 'X User', username: 'xuser' } } })],
    ]);
    const first = await social.handleCallback('twitter', { code: 'c', state, httpFetch });
    expect(first.ok).toBe(true);
    // Reuse: the state is already consumed.
    const second = await social.handleCallback('twitter', { code: 'c', state, httpFetch });
    expect(second.ok).toBe(false);
  });

  it('an EXPIRED state → rejected and burned', async () => {
    const { authorize_url: url } = await social.startOAuth('linkedin', superAdmin.id);
    const state = new URL(url).searchParams.get('state');
    await pool.query('UPDATE content_oauth_states SET expires_at = NOW() - interval \'1 minute\' WHERE state=$1', [state]);
    const out = await social.handleCallback('linkedin', { code: 'c', state, httpFetch: fetchMock([]) });
    expect(out.ok).toBe(false);
    const s = await pool.query('SELECT 1 FROM content_oauth_states WHERE state=$1', [state]);
    expect(s.rowCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Adapters
// ---------------------------------------------------------------------------
describe('adapters', () => {
  afterEach(async () => { await clearAccounts(); });

  it('linkedinAdapter.send success → sent + external ref', async () => {
    const account = await connectAccount('linkedin', { access: 'A', extId: 'li_sub' });
    const httpFetch = fetchMock([
      ['rest/posts', mockRes({ status: 201, headers: { 'x-restli-id': 'urn:li:share:678' } })],
    ]);
    const out = await social.linkedinAdapter.send({ id: 'i1', body: 'Hello LinkedIn' }, { httpFetch, account });
    expect(out.result).toBe('sent');
    expect(out.externalRef).toBe('urn:li:share:678');
  });

  it('linkedinAdapter.send API error → failed (no throw)', async () => {
    const account = await connectAccount('linkedin', { access: 'A' });
    const httpFetch = fetchMock([
      ['rest/posts', mockRes({ ok: false, status: 422, json: { message: 'bad' } })],
    ]);
    const out = await social.linkedinAdapter.send({ id: 'i2', body: 'x' }, { httpFetch, account });
    expect(out.result).toBe('failed');
    expect(out.detail).toMatch(/422/);
  });

  it('twitterAdapter over 280 chars → failed with NO network POST', async () => {
    const account = await connectAccount('twitter', { access: 'A' });
    const httpFetch = fetchMock([['api.twitter.com', mockRes({ json: {} })]]);
    const longBody = 'a'.repeat(281);
    const out = await social.twitterAdapter.send({ id: 'i3', body: longBody }, { httpFetch, account });
    expect(out.result).toBe('failed');
    expect(out.detail).toMatch(/280/);
    expect(httpFetch.calls.length).toBe(0); // no POST attempted
  });

  it('twitterAdapter under the limit → sent', async () => {
    const account = await connectAccount('twitter', { access: 'A' });
    const httpFetch = fetchMock([
      ['2/tweets', mockRes({ json: { data: { id: 'tweet_99', text: 'hi' } } })],
    ]);
    const out = await social.twitterAdapter.send({ id: 'i4', body: 'short and sweet' }, { httpFetch, account });
    expect(out.result).toBe('sent');
    expect(out.externalRef).toBe('tweet_99');
  });

  it('refresh path: an expired token is refreshed and the new token persisted encrypted', async () => {
    const account = await connectAccount('twitter', { access: 'OLD_ACCESS', refresh: 'OLD_REFRESH', expired: true, extId: 'x_ref' });
    const httpFetch = fetchMock([
      ['oauth2/token', mockRes({ json: { access_token: 'NEW_ACCESS', refresh_token: 'NEW_REFRESH', expires_in: 7200 } })],
      ['2/tweets', mockRes({ json: { data: { id: 'tw_refresh', text: 'hi' } } })],
    ]);
    const out = await social.twitterAdapter.send({ id: 'i5', body: 'after refresh' }, { httpFetch, account });
    expect(out.result).toBe('sent');
    // The token endpoint WAS called (refresh) before the publish.
    expect(httpFetch.calls.some((c) => c.url.includes('oauth2/token'))).toBe(true);
    // The new token is persisted ENCRYPTED (not plaintext) and decrypts back.
    const row = await pool.query('SELECT access_token_enc FROM content_channel_accounts WHERE id=$1', [account.id]);
    expect(row.rows[0].access_token_enc).not.toContain('NEW_ACCESS');
    expect(tokenCrypto.decrypt(row.rows[0].access_token_enc)).toBe('NEW_ACCESS');
  });
});

// ---------------------------------------------------------------------------
// 5. publishDue — CLAIM → SEND → FINALIZE
// ---------------------------------------------------------------------------
describe('publishDue with real adapters', () => {
  afterEach(async () => { await clearAccounts(); });

  it('a connected channel publishes for real and logs the real adapter name', async () => {
    await connectAccount('twitter', { access: 'A', extId: 'x_pub' });
    const item = await insertItem({ channel: 'twitter', autonomy_tier: 0, body: 'live tweet' });
    const httpFetch = fetchMock([
      ['2/tweets', mockRes({ json: { data: { id: 'tw_live', text: 'live tweet' } } })],
    ]);
    const res = await publisher.publishDue(new Date(), { httpFetch });
    expect(res.published).toBeGreaterThanOrEqual(1);
    const row = await pool.query('SELECT status, external_ref FROM content_items WHERE id=$1', [item.id]);
    expect(row.rows[0].status).toBe('published');
    expect(row.rows[0].external_ref).toBe('tw_live');
    const log = await pool.query('SELECT adapter, result FROM content_publish_log WHERE content_id=$1', [item.id]);
    expect(log.rows[0].adapter).toBe('twitter');
    expect(log.rows[0].result).toBe('sent');
  });

  it('with NO connection the channel falls back to the outbox adapter', async () => {
    // whatsapp_tip is an OUTBOX-only channel (blog is now a real internal
    // publisher — see content-blog.test.js), so it exercises the outbox fallback.
    const item = await insertItem({ channel: 'whatsapp_tip', engine: 'record', autonomy_tier: 0, body: 'b' });
    const res = await publisher.publishDue(new Date(), { httpFetch: fetchMock([]) });
    expect(res.published).toBeGreaterThanOrEqual(1);
    const row = await pool.query('SELECT status, external_ref FROM content_items WHERE id=$1', [item.id]);
    expect(row.rows[0].status).toBe('published');
    expect(row.rows[0].external_ref).toMatch(/^outbox:/);
  });

  it('the tier gate still SKIPS an unapproved Tier 1 item', async () => {
    await connectAccount('twitter', { access: 'A' });
    const bad = await insertItem({ channel: 'twitter', autonomy_tier: 1, approved_at: null, body: 'nope' });
    await publisher.publishDue(new Date(), { httpFetch: fetchMock([['2/tweets', mockRes({ json: { data: { id: 'z' } } })]]) });
    const row = await pool.query('SELECT status, published_at, publish_attempts FROM content_items WHERE id=$1', [bad.id]);
    expect(row.rows[0].status).toBe('scheduled');
    expect(row.rows[0].published_at).toBeNull();
    // Never claimed → attempts untouched.
    expect(row.rows[0].publish_attempts).toBe(0);
  });

  it('a failed send clears publish_started_at for retry and increments publish_attempts', async () => {
    await connectAccount('twitter', { access: 'A' });
    // Over-length body → the adapter fails BEFORE any network POST.
    const item = await insertItem({ channel: 'twitter', autonomy_tier: 0, body: 'a'.repeat(300) });
    const res = await publisher.publishDue(new Date(), { httpFetch: fetchMock([['2/tweets', mockRes({ json: { data: { id: 'z' } } })]]) });
    expect(res.failed).toBeGreaterThanOrEqual(1);
    const row = await pool.query('SELECT status, publish_started_at, publish_attempts FROM content_items WHERE id=$1', [item.id]);
    // Claimed (attempts incremented) then released for retry (started_at cleared).
    expect(row.rows[0].publish_attempts).toBe(1);
    expect(row.rows[0].publish_started_at).toBeNull();
    expect(row.rows[0].status).toBe('scheduled');
    const log = await pool.query(`SELECT result, adapter FROM content_publish_log WHERE content_id=$1`, [item.id]);
    expect(log.rows[0].result).toBe('failed');
    expect(log.rows[0].adapter).toBe('twitter');
  });
});

// ---------------------------------------------------------------------------
// 5b. Meta (Facebook + Instagram) — connectable but INERT (Batch FBIG1)
// This worker has NO META_APP_ID / META_APP_SECRET / page/IG token set, so the
// Meta channels are unconfigured. connect must report "not configured" and a
// publish must be a graceful skip: no throw, no Graph network call.
// ---------------------------------------------------------------------------
describe('Meta publishers (Facebook + Instagram) — gated on a Meta app', () => {
  it('are unconfigured without a Meta app', () => {
    expect(meta.metaConfigured('facebook')).toBe(false);
    expect(meta.metaConfigured('instagram')).toBe(false);
  });

  it('appear in /config as connectable channels (configured:false, connected:false)', async () => {
    const res = await withToken(request(app).get('/api/admin/content/config'), superAdmin.token);
    expect(res.status).toBe(200);
    for (const ch of ['facebook', 'instagram']) {
      expect(res.body.channels[ch]).toBeTruthy();
      expect(res.body.channels[ch].configured).toBe(false);
      expect(res.body.channels[ch].connected).toBe(false);
    }
    // No token/secret is ever exposed in the config projection.
    expect(JSON.stringify(res.body.channels)).not.toMatch(/token|secret/i);
  });

  it('accept facebook/instagram as a valid channel filter (not a 400)', async () => {
    for (const ch of ['facebook', 'instagram']) {
      const res = await withToken(request(app).get(`/api/admin/content?channel=${ch}`), superAdmin.token);
      expect(res.status).toBe(200);
    }
  });

  it('an unconfigured connect reports "not configured" (no state minted, no network)', async () => {
    for (const ch of ['facebook', 'instagram']) {
      const res = await withToken(request(app).get(`/api/admin/content/oauth/${ch}/start`), superAdmin.token);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not configured/i);
    }
  });

  it('publishing to Facebook with no Meta app is a graceful skip — no throw, no network', async () => {
    const item = await insertItem({ channel: 'facebook', engine: 'reach', autonomy_tier: 0, body: 'hello page' });
    const httpFetch = fetchMock([]); // any Graph call would throw "unexpected fetch"
    const res = await publisher.publishDue(new Date(), { httpFetch });
    expect(res.published).toBeGreaterThanOrEqual(1);
    // No Graph API call was ever attempted.
    expect(httpFetch.calls.length).toBe(0);
    const row = await pool.query('SELECT status, external_ref FROM content_items WHERE id=$1', [item.id]);
    expect(row.rows[0].status).toBe('published');
    expect(row.rows[0].external_ref).toMatch(/^meta-skip:facebook:/);
    const log = await pool.query('SELECT adapter, result, detail FROM content_publish_log WHERE content_id=$1', [item.id]);
    expect(log.rows[0].adapter).toBe('facebook');
    expect(log.rows[0].result).toBe('sent');
    expect(log.rows[0].detail).toMatch(/not connected|Meta app not configured/i);
  });

  it('publishing to Instagram with no Meta app is a graceful skip — no throw, no network', async () => {
    const item = await insertItem({ channel: 'instagram', engine: 'reach', autonomy_tier: 0, body: 'hello ig' });
    const httpFetch = fetchMock([]);
    const res = await publisher.publishDue(new Date(), { httpFetch });
    expect(res.published).toBeGreaterThanOrEqual(1);
    expect(httpFetch.calls.length).toBe(0);
    const row = await pool.query('SELECT status, external_ref FROM content_items WHERE id=$1', [item.id]);
    expect(row.rows[0].status).toBe('published');
    expect(row.rows[0].external_ref).toMatch(/^meta-skip:instagram:/);
    const log = await pool.query('SELECT adapter, result FROM content_publish_log WHERE content_id=$1', [item.id]);
    expect(log.rows[0].adapter).toBe('instagram');
    expect(log.rows[0].result).toBe('sent');
  });

  it('the adapter never throws even when send is called directly while unconfigured', async () => {
    await expect(meta.facebookAdapter.send({ id: 'x', body: 'b' })).resolves.toMatchObject({ result: 'sent' });
    await expect(meta.instagramAdapter.send({ id: 'y', body: 'b' })).resolves.toMatchObject({ result: 'sent' });
  });
});

// ---------------------------------------------------------------------------
// 6. Role / scoping
// ---------------------------------------------------------------------------
describe('auth + permission scoping', () => {
  it('start/accounts/disconnect require content:manage; callback is public but state-gated', async () => {
    // No token → 401.
    expect((await request(app).get('/api/admin/content/oauth/linkedin/start')).status).toBe(401);
    expect((await request(app).get('/api/admin/content/accounts')).status).toBe(401);
    // Owner (non-admin) → 403.
    expect((await withToken(request(app).get('/api/admin/content/accounts'), ownerUser.token)).status).toBe(403);
    expect((await withToken(request(app).post('/api/admin/content/accounts/linkedin/disconnect'), ownerUser.token)).status).toBe(403);
    // The callback is PUBLIC (no token) but rejects an invalid state with 400.
    expect((await request(app).get('/api/admin/content/oauth/linkedin/callback?code=x&state=nope')).status).toBe(400);
  });
});
