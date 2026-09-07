const crypto = require('crypto');
const { query } = require('../config/db');
const tokenCrypto = require('../utils/token-crypto');

// Real LinkedIn + X (Twitter) social publishers over OAuth 2.0 (Batch S). This
// module owns:
//   - the per-provider OAuth config (endpoints, scopes, request shapes), kept in
//     ONE place so a platform-version bump is a localized edit;
//   - the CSRF-safe authorize/callback flow (single-use 32-byte `state`, PKCE
//     S256 for X, a FIXED redirect URI built from PUBLIC_BASE_URL — never from
//     request input);
//   - encrypted-at-rest token storage (AES-256-GCM via utils/token-crypto) and
//     lazy token refresh;
//   - the linkedinAdapter / twitterAdapter the publisher calls at send time.
//
// CREDENTIAL-GATED + INERT: with no app credentials or no connected account the
// publisher resolves the OUTBOX adapter instead (see content-publisher.service),
// so the pipeline never breaks. All network I/O goes through an injectable
// `httpFetch` (defaults to the global fetch) so tests make NO real network call.
//
// SECURITY: a token or the encryption key is NEVER logged or returned. The
// accounts projection (accountView) exposes no token column, and error `detail`
// strings are synthesized from status codes — never echoed provider bodies.

const DEFAULT_BASE_URL = 'https://khata.dadashaik.com';
const STATE_TTL_MS = 10 * 60 * 1000; // states expire in <= 10 minutes
const OAUTH_CALLBACK_PATH = '/api/admin/content/oauth'; // + /:channel/callback

// Per-provider configuration. Endpoints, the exact identity field that becomes
// external_account_id, the least-privilege scope, and whether PKCE is used.
const PROVIDERS = Object.freeze({
  linkedin: {
    channel: 'linkedin',
    authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    identityUrl: 'https://api.linkedin.com/v2/userinfo',
    publishUrl: 'https://api.linkedin.com/rest/posts',
    scope: 'openid profile w_member_social',
    pkce: false,
    clientIdEnv: 'LINKEDIN_CLIENT_ID',
    clientSecretEnv: 'LINKEDIN_CLIENT_SECRET',
  },
  twitter: {
    channel: 'twitter',
    authorizeUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    identityUrl: 'https://api.twitter.com/2/users/me',
    publishUrl: 'https://api.twitter.com/2/tweets',
    scope: 'tweet.read tweet.write users.read offline.access',
    pkce: true,
    clientIdEnv: 'TWITTER_CLIENT_ID',
    clientSecretEnv: 'TWITTER_CLIENT_SECRET',
  },
});

const TWEET_MAX_CHARS = 280;

function providerFor(channel) {
  return PROVIDERS[channel] || null;
}

function clientId(channel) {
  const p = providerFor(channel);
  return p ? process.env[p.clientIdEnv] || '' : '';
}
function clientSecret(channel) {
  const p = providerFor(channel);
  return p ? process.env[p.clientSecretEnv] || '' : '';
}

// The public base URL the platform app registered. NEVER derived from a request.
function baseUrl() {
  const raw = process.env.PUBLIC_BASE_URL && process.env.PUBLIC_BASE_URL.trim();
  return (raw || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

// The FIXED redirect URI for a channel — base + a constant path. The operator
// registers this exact string in the LinkedIn/X app.
function redirectUri(channel) {
  return `${baseUrl()}${OAUTH_CALLBACK_PATH}/${channel}/callback`;
}

// oauthConfigured(channel) — the token key AND this channel's client id/secret
// are all present, so the OAuth flow can run. Mirrors the drafter's env gating.
function oauthConfigured(channel) {
  if (!providerFor(channel)) return false;
  return Boolean(tokenCrypto.isConfigured() && clientId(channel) && clientSecret(channel));
}

// publishConfigured(channel) — oauthConfigured AND an active connected account
// exists, so real publishing is possible. Async (reads the DB).
async function publishConfigured(channel) {
  if (!oauthConfigured(channel)) return false;
  const acct = await getActiveAccount(channel);
  return Boolean(acct);
}

// ---------------------------------------------------------------------------
// PKCE + state
// ---------------------------------------------------------------------------
function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// A 32-byte random single-use state token (hex).
function generateState() {
  return crypto.randomBytes(32).toString('hex');
}

// A PKCE code_verifier (43 chars, base64url) + its S256 code_challenge.
function generatePkce() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------
// The active connected account row for a channel, or null. Returns the RAW row
// (including the encrypted token columns) — callers decrypt in-memory only.
async function getActiveAccount(channel, client) {
  const q = client || query;
  const r = await q(
    `SELECT * FROM content_channel_accounts WHERE channel = $1 AND is_active = true LIMIT 1`,
    [channel]
  );
  return r.rows[0] || null;
}

// The SAFE projection returned by the API — NEVER any token column.
function accountView(row) {
  return {
    channel: row.channel,
    display_name: row.display_name,
    external_account_id: row.external_account_id,
    scope: row.scope,
    token_expires_at: row.token_expires_at,
    is_active: row.is_active,
  };
}

async function listAccounts() {
  const r = await query(
    `SELECT channel, display_name, external_account_id, scope, token_expires_at, is_active
     FROM content_channel_accounts WHERE is_active = true ORDER BY channel`
  );
  return r.rows.map(accountView);
}

async function disconnect(channel) {
  const r = await query(
    `UPDATE content_channel_accounts SET is_active = false, updated_at = NOW()
     WHERE channel = $1 AND is_active = true RETURNING id`,
    [channel]
  );
  return r.rowCount > 0;
}

// ---------------------------------------------------------------------------
// OAuth start
// ---------------------------------------------------------------------------
// Create a single-use state row (+ PKCE for X) and return the provider authorize
// URL. The caller (route) must have already checked oauthConfigured(channel).
async function startOAuth(channel, createdBy, { client } = {}) {
  const p = providerFor(channel);
  if (!p) throw new Error('Unknown channel');

  const q = client || query;
  const state = generateState();
  const redirect = redirectUri(channel);
  const expiresAt = new Date(Date.now() + STATE_TTL_MS);
  const pkce = p.pkce ? generatePkce() : null;

  await q(
    `INSERT INTO content_oauth_states (state, channel, code_verifier, redirect_uri, created_by, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [state, channel, pkce ? pkce.verifier : null, redirect, createdBy || null, expiresAt]
  );

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId(channel),
    redirect_uri: redirect,
    scope: p.scope,
    state,
  });
  if (pkce) {
    params.set('code_challenge', pkce.challenge);
    params.set('code_challenge_method', 'S256');
  }
  return { authorize_url: `${p.authorizeUrl}?${params.toString()}` };
}

// ---------------------------------------------------------------------------
// OAuth callback — the token exchange + identity fetch + account upsert
// ---------------------------------------------------------------------------
async function readBody(res) {
  // Tolerant body reader for a fetch-like Response (mockable in tests).
  try {
    return await res.json();
  } catch {
    try { return { _text: await res.text() }; } catch { return {}; }
  }
}

// Exchange an authorization `code` for tokens at the provider token endpoint.
// PKCE verifier for X; Basic auth (confidential client) for X, form client
// credentials for LinkedIn. Returns the parsed token payload.
async function exchangeCode(channel, { code, redirect, codeVerifier, httpFetch }) {
  const p = providerFor(channel);
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirect,
    client_id: clientId(channel),
  });
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };

  if (channel === 'twitter') {
    if (codeVerifier) form.set('code_verifier', codeVerifier);
    const basic = Buffer.from(`${clientId(channel)}:${clientSecret(channel)}`).toString('base64');
    headers.Authorization = `Basic ${basic}`;
  } else {
    form.set('client_secret', clientSecret(channel));
  }

  const res = await httpFetch(p.tokenUrl, { method: 'POST', headers, body: form.toString() });
  const body = await readBody(res);
  if (!res.ok || !body || !body.access_token) {
    throw new Error(`token exchange failed (HTTP ${res.status})`);
  }
  return body;
}

// Fetch the connected identity (external id + display name).
async function fetchIdentity(channel, { accessToken, httpFetch }) {
  const p = providerFor(channel);
  const res = await httpFetch(p.identityUrl, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  const body = await readBody(res);
  if (!res.ok || !body) throw new Error(`identity fetch failed (HTTP ${res.status})`);

  if (channel === 'linkedin') {
    // OpenID userinfo → { sub, name, ... }
    return { externalId: body.sub || null, displayName: body.name || null };
  }
  // X /users/me → { data: { id, name, username } }
  const d = body.data || {};
  return { externalId: d.id || null, displayName: d.name || d.username || null };
}

// Persist a freshly connected account: deactivate any prior active row for the
// channel, then insert the new one with ENCRYPTED tokens. Runs in one tx.
async function upsertAccount(channel, { tokens, identity, scope, connectedBy, client }) {
  const q = client || query;
  const accessEnc = tokenCrypto.encrypt(tokens.access_token);
  const refreshEnc = tokens.refresh_token ? tokenCrypto.encrypt(tokens.refresh_token) : null;
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + Number(tokens.expires_in) * 1000)
    : null;

  await q(`UPDATE content_channel_accounts SET is_active = false, updated_at = NOW()
           WHERE channel = $1 AND is_active = true`, [channel]);
  const r = await q(
    `INSERT INTO content_channel_accounts
       (channel, external_account_id, display_name, access_token_enc, refresh_token_enc,
        token_expires_at, scope, is_active, connected_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8)
     RETURNING channel, display_name, external_account_id, scope, token_expires_at, is_active`,
    [channel, identity.externalId, identity.displayName, accessEnc, refreshEnc,
      expiresAt, scope || null, connectedBy || null]
  );
  return r.rows[0];
}

// handleCallback — authorize the request SOLELY by the single-use state, then
// exchange + fetch identity + upsert. Returns { ok, account } on success or
// { ok:false, error } on a CSRF/state failure (the route maps that to 400). A
// downstream network/exchange failure throws (the route maps it to an error
// redirect). The state row is DELETED on success (single-use).
async function handleCallback(channel, { code, state, httpFetch = globalThis.fetch } = {}) {
  const p = providerFor(channel);
  if (!p) return { ok: false, error: 'unknown_channel' };
  if (!code || !state) return { ok: false, error: 'missing_params' };

  // Look the state up. It must exist, match the channel, and not be expired.
  const sr = await query(
    `SELECT * FROM content_oauth_states WHERE state = $1 LIMIT 1`, [state]
  );
  const stateRow = sr.rows[0];
  if (!stateRow || stateRow.channel !== channel) {
    return { ok: false, error: 'invalid_state' };
  }
  if (new Date(stateRow.expires_at).getTime() < Date.now()) {
    // Expired — burn it and reject.
    await query(`DELETE FROM content_oauth_states WHERE id = $1`, [stateRow.id]);
    return { ok: false, error: 'expired_state' };
  }

  // The state is valid — from here a failure is an exchange/network error, not
  // CSRF. Exchange the code (using the redirect_uri + PKCE verifier stored with
  // the state, never request input) and fetch identity.
  const tokens = await exchangeCode(channel, {
    code,
    redirect: stateRow.redirect_uri,
    codeVerifier: stateRow.code_verifier,
    httpFetch,
  });
  const identity = await fetchIdentity(channel, { accessToken: tokens.access_token, httpFetch });

  const account = await upsertAccount(channel, {
    tokens,
    identity,
    scope: tokens.scope || p.scope,
    connectedBy: stateRow.created_by,
  });

  // Single-use: consume the state so it can never be replayed.
  await query(`DELETE FROM content_oauth_states WHERE id = $1`, [stateRow.id]);
  return { ok: true, account };
}

// ---------------------------------------------------------------------------
// Token refresh (lazy, inside send)
// ---------------------------------------------------------------------------
function isExpired(expiresAt) {
  if (!expiresAt) return false; // no known expiry → assume valid, let the API decide
  // 60s skew so we refresh just before the edge.
  return new Date(expiresAt).getTime() - 60_000 <= Date.now();
}

// Refresh an access token via the refresh_token grant, then re-encrypt + persist
// the new access token (and rotated refresh token / expiry). Returns the new
// plaintext access token. Throws on failure (the caller records a failed send).
async function refreshAccessToken(channel, account, httpFetch) {
  const p = providerFor(channel);
  if (!account.refresh_token_enc) throw new Error('no refresh token available');
  const refreshToken = tokenCrypto.decrypt(account.refresh_token_enc);

  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId(channel),
  });
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  if (channel === 'twitter') {
    const basic = Buffer.from(`${clientId(channel)}:${clientSecret(channel)}`).toString('base64');
    headers.Authorization = `Basic ${basic}`;
  } else {
    form.set('client_secret', clientSecret(channel));
  }

  const res = await httpFetch(p.tokenUrl, { method: 'POST', headers, body: form.toString() });
  const body = await readBody(res);
  if (!res.ok || !body || !body.access_token) {
    throw new Error(`token refresh failed (HTTP ${res.status})`);
  }

  const accessEnc = tokenCrypto.encrypt(body.access_token);
  const refreshEnc = body.refresh_token ? tokenCrypto.encrypt(body.refresh_token) : account.refresh_token_enc;
  const expiresAt = body.expires_in ? new Date(Date.now() + Number(body.expires_in) * 1000) : null;
  await query(
    `UPDATE content_channel_accounts
     SET access_token_enc = $1, refresh_token_enc = $2, token_expires_at = $3, updated_at = NOW()
     WHERE id = $4`,
    [accessEnc, refreshEnc, expiresAt, account.id]
  );
  return body.access_token;
}

// Return a valid plaintext access token for the account, refreshing first if it
// is expired and a refresh token exists. In-memory only — never persisted or
// logged in plaintext.
async function validAccessToken(channel, account, httpFetch) {
  if (isExpired(account.token_expires_at) && account.refresh_token_enc) {
    return refreshAccessToken(channel, account, httpFetch);
  }
  return tokenCrypto.decrypt(account.access_token_enc);
}

// ---------------------------------------------------------------------------
// Adapters — send(item, ctx). NO DB tx is held during the network call. Returns
// { result:'sent', externalRef, detail } or { result:'failed', detail }. An
// ordinary API failure is returned as 'failed' (not thrown) so the publisher can
// record it and retry.
// ---------------------------------------------------------------------------
const linkedinAdapter = Object.freeze({
  name: 'linkedin',
  async send(item, ctx = {}) {
    const httpFetch = ctx.httpFetch || globalThis.fetch;
    const account = ctx.account || (await getActiveAccount('linkedin'));
    if (!account) return { result: 'failed', detail: 'no connected LinkedIn account' };

    let accessToken;
    try {
      accessToken = await validAccessToken('linkedin', account, httpFetch);
    } catch {
      return { result: 'failed', detail: 'LinkedIn token refresh failed' };
    }

    const body = (item.body || '').toString();
    const payload = {
      author: `urn:li:person:${account.external_account_id}`,
      commentary: body,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };

    let res;
    try {
      res = await httpFetch('https://api.linkedin.com/rest/posts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'LinkedIn-Version': '202401',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify(payload),
      });
    } catch {
      return { result: 'failed', detail: 'LinkedIn request failed (network)' };
    }

    if (!res.ok) {
      return { result: 'failed', detail: `LinkedIn publish failed (HTTP ${res.status})` };
    }
    // The created post id comes back in a header (x-restli-id), with a JSON id
    // as a fallback. We never surface the response body verbatim.
    let externalRef = null;
    try { externalRef = res.headers && res.headers.get ? res.headers.get('x-restli-id') : null; } catch { externalRef = null; }
    if (!externalRef) {
      const b = await readBody(res);
      externalRef = (b && (b.id || b.urn)) || null;
    }
    return { result: 'sent', externalRef: externalRef || `linkedin:${item.id}`, detail: 'published to LinkedIn' };
  },
});

const twitterAdapter = Object.freeze({
  name: 'twitter',
  async send(item, ctx = {}) {
    const httpFetch = ctx.httpFetch || globalThis.fetch;
    const account = ctx.account || (await getActiveAccount('twitter'));
    if (!account) return { result: 'failed', detail: 'no connected X account' };

    const text = (item.body || '').toString();
    // Marketing copy is never silently truncated — an over-length tweet fails
    // loudly (before ANY network POST) so a human can shorten it.
    if ([...text].length > TWEET_MAX_CHARS) {
      return { result: 'failed', detail: 'exceeds 280 characters' };
    }

    let accessToken;
    try {
      accessToken = await validAccessToken('twitter', account, httpFetch);
    } catch {
      return { result: 'failed', detail: 'X token refresh failed' };
    }

    let res;
    try {
      res = await httpFetch('https://api.twitter.com/2/tweets', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
    } catch {
      return { result: 'failed', detail: 'X request failed (network)' };
    }

    if (!res.ok) {
      return { result: 'failed', detail: `X publish failed (HTTP ${res.status})` };
    }
    const b = await readBody(res);
    const id = (b && b.data && b.data.id) || null;
    return { result: 'sent', externalRef: id || `twitter:${item.id}`, detail: 'published to X' };
  },
});

const ADAPTERS = Object.freeze({ linkedin: linkedinAdapter, twitter: twitterAdapter });

module.exports = {
  PROVIDERS,
  TWEET_MAX_CHARS,
  oauthConfigured,
  publishConfigured,
  redirectUri,
  baseUrl,
  generateState,
  generatePkce,
  startOAuth,
  handleCallback,
  exchangeCode,
  fetchIdentity,
  upsertAccount,
  getActiveAccount,
  listAccounts,
  disconnect,
  accountView,
  isExpired,
  refreshAccessToken,
  validAccessToken,
  linkedinAdapter,
  twitterAdapter,
  ADAPTERS,
};
