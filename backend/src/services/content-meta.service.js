const { randomUUID } = require('crypto');
const settings = require('../config/settings');

// Facebook (Page) + Instagram (Business) publishers via the Meta Graph API
// (Batch FBIG1). This module MIRRORS the LinkedIn/X social publisher shape
// (content-social.service) — a per-channel provider config, a connect/status
// entry point, and a send() adapter the publisher resolves — but it ships
// INERT and CREDENTIAL-GATED.
//
// WHY INERT: the Meta Graph path needs EXTERNAL, per-tenant credentials this
// project does not hold yet — a Meta app (App ID + App Secret) that has passed
// App Review for `pages_manage_posts` / `instagram_content_publish`, plus a
// long-lived Facebook Page access token and an Instagram Business account id
// (the SAME "needs a Meta app" gate that parks the auto-post seam — see
// admin-dashboard/src/utils/metaCommerce.js and platform_settings
// 'meta_autopost_enabled'). Until those exist:
//   - metaConfigured(channel) is false;
//   - connect(channel) reports a clear "Meta app not configured" status and
//     mints NOTHING;
//   - the adapter's send() is a graceful NO-OP: it records a "skipped — Meta
//     app not configured" result and NEVER throws and NEVER calls the Graph API
//     (no fake tokens, no network).
// So Facebook + Instagram show in the content desk as connectable publishers,
// visible and "Connect"-ready, and go live only once a real Meta app is wired
// at the single GRAPH SEAM marked below.
//
// The connected-account storage is kept CONSISTENT with linkedin/twitter: when
// the live path is built it reuses the existing `content_channel_accounts` row
// shape (channel = 'facebook' | 'instagram'), so no new column / migration is
// needed to scaffold this.

// Per-provider configuration. Endpoints are documented so the platform-version
// bump is a localized edit when the live path attaches; NONE of these URLs is
// contacted while the channel is unconfigured. `tokenEnv` is the per-channel
// long-lived token the operator supplies once the Meta app exists — the name
// is both the setting key (Admin -> Settings) and the .env fallback, read via
// config/settings.
const PROVIDERS = Object.freeze({
  facebook: {
    channel: 'facebook',
    // Graph publish target for a Page feed post (attaches at the seam).
    publishUrl: 'https://graph.facebook.com/v19.0/{page-id}/feed',
    appIdEnv: 'META_APP_ID',
    appSecretEnv: 'META_APP_SECRET',
    tokenEnv: 'META_PAGE_TOKEN', // long-lived Facebook Page access token
  },
  instagram: {
    channel: 'instagram',
    // Instagram Business publish is a two-step create-container → publish flow
    // (attaches at the seam).
    publishUrl: 'https://graph.facebook.com/v19.0/{ig-user-id}/media',
    appIdEnv: 'META_APP_ID',
    appSecretEnv: 'META_APP_SECRET',
    tokenEnv: 'META_IG_TOKEN', // Instagram Business account token
  },
});

function providerFor(channel) {
  return PROVIDERS[channel] || null;
}

function isMetaChannel(channel) {
  return Boolean(PROVIDERS[channel]);
}

function appId() {
  return settings.get('META_APP_ID');
}
function appSecret() {
  return settings.get('META_APP_SECRET');
}
function channelToken(channel) {
  const p = providerFor(channel);
  return p ? settings.get(p.tokenEnv) : '';
}

// metaConfigured(channel) — the Meta app credentials (App ID + App Secret) AND
// this channel's long-lived Page/IG token are all present, so a real Graph
// publish is possible (panel or env, via config/settings). Until an operator
// supplies these, this is false and the publisher stays inert.
function metaConfigured(channel) {
  if (!isMetaChannel(channel)) return false;
  return Boolean(appId() && appSecret() && channelToken(channel));
}

// connect(channel) — the connect entry the content desk calls (analogous to
// social.startOAuth). While the Meta app is unconfigured this reports a clear
// "not configured" status and mints NOTHING — no state, no token, no network.
// Once metaConfigured is true, the real Meta OAuth start attaches at the GRAPH
// SEAM below.
function connect(channel) {
  if (!isMetaChannel(channel)) {
    return { ok: false, reason: 'unknown_channel', message: 'Unsupported channel' };
  }
  if (!metaConfigured(channel)) {
    return {
      ok: false,
      reason: 'not_configured',
      message: 'Meta app not configured — set META_APP_ID / META_APP_SECRET and the Page/Instagram token',
    };
  }
  // ==========================================================================
  // GRAPH SEAM (connect): with a configured Meta app, the real per-tenant Meta
  // OAuth start attaches HERE — mint a single-use state, build the Facebook
  // Login authorize URL for `pages_manage_posts` / `instagram_content_publish`,
  // and return { ok: true, authorize_url }. Deferred until credentials exist.
  // ==========================================================================
  return {
    ok: false,
    reason: 'not_available',
    message: 'Meta connect is not yet available',
  };
}

// The publish adapter for a Meta channel. Mirrors the outbox/social adapter
// contract: send(item, ctx) → { result:'sent', externalRef, detail } or
// { result:'failed', detail }. It NEVER throws and, while unconfigured, NEVER
// touches the network: it records a graceful "skipped — not connected" result
// (marked 'sent' so the pipeline finalizes and never churns retries, exactly
// like the outbox fallback). The real Graph publish attaches at the seam.
function makeAdapter(channel) {
  const label = channel === 'facebook' ? 'Facebook' : 'Instagram';
  return Object.freeze({
    name: channel,
    async send(item /* , ctx = {} */) {
      if (!metaConfigured(channel)) {
        // GRACEFUL SKIP — no Meta app configured. No Graph call, no throw.
        return {
          result: 'sent',
          externalRef: `meta-skip:${channel}:${randomUUID()}`,
          detail: `skipped — ${label} not connected (Meta app not configured)`,
        };
      }
      // ======================================================================
      // GRAPH SEAM (publish): with a configured Meta app + connected account,
      // the real Graph publish attaches HERE — resolve the Page/IG token from
      // the connected `content_channel_accounts` row, POST the caption (and,
      // for Instagram, run the create-container → publish two-step) to
      // PROVIDERS[channel].publishUrl via the injectable ctx.httpFetch, and
      // return { result:'sent', externalRef:<graph post id> }. On an API error
      // return { result:'failed', detail } (never throw). Deferred until Meta
      // credentials exist.
      // ======================================================================
      return {
        result: 'sent',
        externalRef: `meta-skip:${channel}:${randomUUID()}`,
        detail: `skipped — ${label} live publish not yet wired`,
      };
    },
  });
}

const facebookAdapter = makeAdapter('facebook');
const instagramAdapter = makeAdapter('instagram');

// The publisher's config-gated registry (mirrors content-social.ADAPTERS and
// content-blog.ADAPTERS). This registry OWNS the facebook/instagram channels:
// publishConfigured returns true so the publisher always resolves the meta
// adapter for these channels, and the adapter itself checks metaConfigured()
// and gracefully skips (recording a "not connected" result, never calling
// Graph) until the operator wires a Meta app.
const ADAPTERS = Object.freeze({ facebook: facebookAdapter, instagram: instagramAdapter });

// publishConfigured(channel) — true for the Meta channels this registry owns.
// (Not a claim that the Meta app IS configured — the adapter self-gates on
// metaConfigured(); this just routes FB/IG publishing through the inert meta
// adapter instead of the generic outbox, so the skip is explicit + testable.)
function publishConfigured(channel) {
  return isMetaChannel(channel);
}

module.exports = {
  PROVIDERS,
  isMetaChannel,
  metaConfigured,
  connect,
  facebookAdapter,
  instagramAdapter,
  ADAPTERS,
  publishConfigured,
};
