import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from './api';

// How much work is waiting for a human decision, for the console chrome.
//
// The three review queues (self-serve promo requests, storefront photos and the
// post-publish spot checks) each have their own listing endpoint, and each of
// those returns up to 500 rows. Asking all three on every page load to render
// one number is three round trips of payload for a console that is open all day,
// so the backend answers the whole question in one cheap call:
//
//   GET /api/admin/moderation/pending-count -> { promos, shop_images, spot_checks, total }
//
// It is gated on ads:manage, the SAME permission as the three queues it counts,
// so it can never tell an admin that work exists which they are not allowed to
// see or act on. A caller without that permission is refused, and a refusal is
// indistinguishable here from any other failure: the chrome simply shows no
// count rather than a zero or a broken pill.
//
// The answer is cached module-wide (like adminPerms) so the nav, the hub card
// and the queue itself share ONE request per session, refreshed after a decision
// and when it goes stale.

const EVENT = 'skhata-pending-review';
const TTL_MS = 60_000;

let CACHE = null; // { promos, shop_images, spot_checks, total } | null when unknown
let FETCHED_AT = 0;
let INFLIGHT = null;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function normalise(r) {
  const promos = num(r && r.promos);
  const shopImages = num(r && r.shop_images);
  const spotChecks = num(r && r.spot_checks);
  const total = r && r.total != null ? num(r.total) : promos + shopImages + spotChecks;
  return { promos, shop_images: shopImages, spot_checks: spotChecks, total };
}

function announce() {
  try { window.dispatchEvent(new Event(EVENT)); } catch (e) { /* SSR / no DOM */ }
}

// Drop the cache (logout, or a test between cases) so the next admin does not
// inherit the previous one's numbers.
export function clearPendingReviewCache() {
  CACHE = null;
  FETCHED_AT = 0;
  INFLIGHT = null;
}

function load(force) {
  if (!force && CACHE && Date.now() - FETCHED_AT < TTL_MS) return Promise.resolve(CACHE);
  if (!INFLIGHT) {
    INFLIGHT = apiFetch('/api/admin/moderation/pending-count')
      .then((r) => { CACHE = normalise(r); FETCHED_AT = Date.now(); return CACHE; })
      // A 403 (no ads:manage), an offline phone or a 500 all land here. The
      // count stays UNKNOWN — never 0 — so nothing renders a confident "all
      // clear" it cannot stand behind.
      .catch(() => { CACHE = null; FETCHED_AT = Date.now(); return null; })
      .finally(() => { INFLIGHT = null; });
  }
  return INFLIGHT;
}

// Re-ask now and tell every mounted listener. Called after a decision is taken
// so the badge falls the moment the queue does.
export function refreshPendingReview() {
  return load(true).then((c) => { announce(); return c; });
}

/**
 * Hook: { counts, total, ready, refresh }.
 *
 * `ready` is false until an answer arrives AND stays false when the answer was a
 * failure, so a caller can distinguish "nothing is waiting" (ready, total 0 —
 * calm and settled) from "we do not know" (render nothing at all).
 *
 * Pass enabled=false to skip the request entirely — the nav does that for an
 * admin without ads:manage, so no pointless 403 is fired on every page.
 */
export function usePendingReview(enabled = true) {
  const [counts, setCounts] = useState(CACHE);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    load(false).then((c) => { if (alive) setCounts(c); });
    const on = () => { if (alive) setCounts(CACHE); };
    window.addEventListener(EVENT, on);
    return () => { alive = false; window.removeEventListener(EVENT, on); };
  }, [enabled]);
  const refresh = useCallback(() => refreshPendingReview(), []);
  return {
    counts,
    total: counts ? counts.total : 0,
    ready: !!counts,
    refresh,
  };
}
