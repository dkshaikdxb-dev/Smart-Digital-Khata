// The two reads behind the consumer product-search screen, and how each one
// behaves when the server says no. Both sit on the existing customerApi
// transport (publicFetch / customerFetch), so base URL, token handling and the
// typed error shape — err.status plus the parsed body — are unchanged.
//
// This mirrors the native app's consumerApi.js deliberately, degradation and
// all: the two surfaces talk to the same endpoints and must fail the same way.
import { publicFetch, customerFetch, getCustomerToken } from './customerApi';

// Eight is the cap the screen asks for and about what fits without the shelves
// falling off the bottom of a 360px screen.
export const BUY_AGAIN_MAX = 8;

// One builder for both attempts, so the retry differs from the first request in
// exactly one respect: a keyword instead of a shelf.
function searchPath({ q, category, lang, limit }) {
  const params = new URLSearchParams();
  const text = String(q == null ? '' : q).trim();
  if (text) params.set('q', text);
  if (category) params.set('category', String(category));
  if (lang) params.set('lang', String(lang));
  params.set('limit', String(limit || 30));
  return `/api/public/products/search?${params.toString()}`;
}

/**
 * GET /api/public/products/search — cross-shop product search, the SAME
 * endpoint the native app uses so both surfaces rank and localize identically.
 *
 * `category` is a SHELF KEY (see lib/categories.js), sent instead of a keyword.
 *
 * DEPLOY ORDER. The backend ships before the PWA does, but the reverse is what
 * actually hurts: a browser holding a cached bundle that already knows about
 * shelves, talking to a server that does not. That server drops the unknown
 * `category` param and then refuses the request for want of the `q` it still
 * requires. So a shelf request that comes back REFUSED — 400, 404 or 422 — is
 * retried ONCE with `fallbackTerm`, the very keyword that chip used before this
 * change. The shopper sees the old, narrower results; never an error, never an
 * empty screen, and nothing has to be sequenced.
 *
 * Only a REFUSAL is retried. A timeout or a dead radio (a rejection with no
 * status at all) is the shopper's network and must surface as itself: retrying
 * it would double the wait on 2G and then report the same failure anyway. A 500
 * is not retried either — that server is broken, not old, and the keyword would
 * break it the same way.
 *
 * `signal` lets a caller abort a superseded request instead of paying for it.
 */
export async function searchProducts({
  q, category, fallbackTerm, lang, limit, signal,
} = {}) {
  const opts = signal ? { signal } : undefined;
  try {
    return await publicFetch(searchPath({ q, category, lang, limit }), opts);
  } catch (err) {
    const status = err && err.status;
    const oldServer = status === 400 || status === 404 || status === 422;
    const term = String(fallbackTerm || q || '').trim();
    if (!category || !oldServer || !term) throw err;
    return publicFetch(searchPath({ q: term, lang, limit }), opts);
  }
}

/**
 * GET /api/my/buy-again — the shopper's own previously ordered items, most
 * frequent first. Signed-in only, and the token is checked HERE so a signed-out
 * browser never fires an authenticated request at all.
 *
 * NO PRICE is returned and none should be asked for: a price is a per-shop
 * lookup and this screen is drawn on 2G. The response carries a name, the shop
 * it last came from and how often it was bought — nothing a shopper could
 * mistake for today's rate, and nothing on this path that touches paise.
 *
 * EVERY FAILURE RESOLVES TO AN EMPTY LIST rather than rejecting — a 404 from a
 * server older than this endpoint, a 400, an expired session, a dead radio, a
 * body that is not the contract. The section this feeds renders nothing at all
 * when it is empty, so an older server produces a screen with one section
 * missing, which is exactly the screen a brand-new shopper gets, and never a
 * broken one.
 */
export async function buyAgain(limit) {
  if (!getCustomerToken()) return [];
  try {
    const n = encodeURIComponent(String(limit || BUY_AGAIN_MAX));
    const r = await customerFetch(`/api/my/buy-again?limit=${n}`);
    return r && Array.isArray(r.items) ? r.items : [];
  } catch (e) {
    return [];
  }
}
