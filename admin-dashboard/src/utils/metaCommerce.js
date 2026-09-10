// metaCommerce.js — PARKED seam for the Meta (Facebook / Instagram) LICENSED path.
// ============================================================================
// THIS FILE IS DELIBERATELY NOT WIRED TO ANY NETWORK CALL. It is documentation
// as code: it marks exactly where the Meta Graph API auto-post + Meta commerce
// catalogue sync would attach, and it is gated behind the platform flag
// `meta_autopost_enabled`, which migration 0058 seeds DEFAULT OFF ('false').
//
// WHY IT IS PARKED (and not built in this batch)
// ----------------------------------------------
// The SHIPPED, live viral channel (batch SOCIAL1) is credential-free: the
// SharePoster component draws a branded poster on-device (HTML Canvas + the
// existing `qrcode` package) and the shopkeeper posts it to their WhatsApp
// Status / Instagram / Facebook via the phone's NATIVE share sheet
// (`navigator.share`). No server, no tokens, no Meta app.
//
// The Meta Graph path is fundamentally different: it needs EXTERNAL CREDENTIALS
// that this project does not (and should not lightly) hold —
//   1. A Meta app (App ID + App Secret) that has passed Meta App Review for the
//      `pages_manage_posts`, `instagram_content_publish` and `catalog_management`
//      permissions.
//   2. A per-shop OAuth flow producing a long-lived Page access token and an
//      Instagram Business account id (each shop connects its own Page / IG).
//   3. A Meta Commerce catalogue + Business Manager for the catalogue sync.
// Because those are external, per-tenant credentials requiring an app review and
// secure server-side token storage, this path is DEFERRED. Shipping the seam
// (this file + the flag) keeps the integration point explicit without pulling in
// a dependency, a fake token, or a live call today.
//
// HOW TO READ THE FLAG (when this path is eventually built)
// ---------------------------------------------------------
// `social_share_enabled` — the credential-free poster — IS exposed on
// GET /api/public/config. `meta_autopost_enabled` is intentionally NOT exposed
// there: it is a server-side, admin-only capability, not something the public
// config should advertise. When the licensed path is built, gate it on the
// backend after loading the platform setting, e.g.
//
//     const on = await getPlatformFlag('meta_autopost_enabled'); // default false
//     if (!on) return; // parked — do nothing
//
// The helpers below are INERT stubs. They take no tokens, make no requests, and
// throw a clear "parked" error if ever called, so an accidental import can never
// silently reach out to Meta.

// The platform flag name (matches migration 0058). Default OFF.
export const META_AUTOPOST_FLAG = 'meta_autopost_enabled';

// Always false in this batch: there is no live Meta integration. A future batch
// that wires the licensed path replaces this with a real, server-driven check of
// the `meta_autopost_enabled` platform setting (never a client-trusted value).
export function isMetaAutopostEnabled() {
  return false;
}

// PARKED: auto-publish the poster to a shop's connected Facebook Page / Instagram
// Business account via the Meta Graph API. NOT IMPLEMENTED — requires a Meta app
// + per-shop Page/IG access tokens (see the header). Kept as an explicit seam.
export async function publishToMeta(/* { shopId, imageBlob, caption, link } */) {
  throw new Error(
    'metaCommerce.publishToMeta is a parked seam: the Meta Graph auto-post path ' +
      'requires a Meta app + per-shop Page/IG tokens and is disabled ' +
      '(meta_autopost_enabled=false). Use the on-device SharePoster share sheet instead.'
  );
}

// PARKED: sync the shop's catalogue to a Meta Commerce catalogue. NOT IMPLEMENTED
// — requires a Meta Business Manager + catalogue + management permissions.
export async function syncCatalogueToMeta(/* { shopId, products } */) {
  throw new Error(
    'metaCommerce.syncCatalogueToMeta is a parked seam: Meta commerce catalogue ' +
      'sync requires a Meta Business Manager + catalogue credentials and is disabled ' +
      '(meta_autopost_enabled=false).'
  );
}
