// Shared promo plumbing for the consumer PWA (batch STOREFRONT-FULL): the
// impression/click beacons + the link_type → destination rule. Extracted from
// CpwaPromoSlider (the discovery band) so the storefront sponsored slide
// (ShopCarousel) fires the SAME beacons and follows the SAME link handling —
// one implementation, two surfaces.

const VID_KEY = 'skhata-vid';

// The API base publicFetch targets. Used only for the fire-and-forget beacons,
// which are sent with sendBeacon/keepalive so a same-tab navigation on click
// does not cancel them.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Per-session in-memory fallback viewer id, used only when localStorage is
// unavailable (SSR, private mode, blocked store) so the impression beacon still
// carries a stable-within-this-page token instead of nothing.
let memoryVid = null;

// A random opaque token — no PII. Prefers crypto.randomUUID; falls back to a
// Math.random-based id when it (or crypto) is missing.
function newVid() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (e) {
    /* fall through to the Math.random path */
  }
  return `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// Return a stable anonymous viewer id from localStorage['skhata-vid'], creating
// one on first use. SSR-guarded and wrapped in try/catch: if storage is blocked
// we keep a per-session in-memory id so the beacon still carries something. The
// id is a random opaque per-device token, never PII.
export function getViewerId() {
  if (typeof window === 'undefined') {
    if (!memoryVid) memoryVid = newVid();
    return memoryVid;
  }
  try {
    let vid = window.localStorage.getItem(VID_KEY);
    if (!vid) {
      vid = newVid();
      window.localStorage.setItem(VID_KEY, vid);
    }
    return vid;
  } catch (e) {
    if (!memoryVid) memoryVid = newVid();
    return memoryVid;
  }
}

// Best-effort impression/click beacon. Fire-and-forget: never awaited, and every
// path is wrapped so a failure (blocked network, cancelled request, missing API)
// can never throw into the shopper's UI. Prefers sendBeacon so the click beacon
// survives the same-tab navigation that immediately follows it.
export function fireBeacon(id, kind) {
  if (!id) return;
  try {
    let url = `${API_BASE}/api/public/promos/${encodeURIComponent(id)}/${kind}`;
    // The impression beacon carries the stable viewer id so the server can dedup
    // per (campaign, viewer, day). Passed in the URL so it survives sendBeacon
    // (which sends no readable body). Clicks stay raw — no vid.
    if (kind === 'impression') {
      const vid = getViewerId();
      if (vid) url += `?vid=${encodeURIComponent(vid)}`;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(url);
      return;
    }
    if (typeof fetch === 'function') {
      fetch(url, { method: 'POST', keepalive: true }).catch(() => {});
    }
  } catch (e) {
    /* beacons are best-effort — swallow everything, never surface to the shopper */
  }
}

// Follow a promo's link by link_type (the ONE rule for every sponsored surface):
//   shop / product → the seller's shop page (no standalone product route exists
//                    in the consumer app, so a product link opens its shop)
//   url            → open in a new tab (noopener; a blocked popup is ignored)
//   brand          → the cross-shop product search for the promo title
//   none           → no-op
// `p` is any object carrying link_type / link_shop_id / link_url / title.
export function followPromoLink(router, p) {
  if (!p) return;
  const type = p.link_type;
  if (type === 'shop' && p.link_shop_id) {
    router.push(`/c/shop/${p.link_shop_id}`);
  } else if (type === 'product' && p.link_shop_id) {
    router.push(`/c/shop/${p.link_shop_id}`);
  } else if (type === 'url' && p.link_url) {
    try {
      window.open(p.link_url, '_blank', 'noopener');
    } catch (e) {
      /* popup blocked — nothing to recover, do not disturb the shopper */
    }
  } else if (type === 'brand' && p.title) {
    router.push(`/c/products?q=${encodeURIComponent(p.title)}`);
  }
  // 'none' (or a link with no usable target) → no-op.
}
