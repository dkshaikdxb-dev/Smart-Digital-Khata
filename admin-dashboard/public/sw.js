/* Smart Digital Khata — service worker
 *
 * App-shell caching for fast loads + offline fallback. Read-mostly API GETs are
 * cached stale-while-revalidate so the app opens on patchy 2G; writes and auth
 * are never cached. In production nginx proxies /api/ same-origin, so these
 * requests are visible here.
 *
 * THE CACHE NAME IS THE BUILD ID, NOT A CONSTANT.
 * It used to be a hand-typed 'skhata-v2'. Nobody remembered to bump it, so a
 * deploy shipped new code against a cache the browser had been filling for
 * weeks: a shopkeeper could open the customer list and read an outstanding
 * balance from days earlier, with no sign on screen that it was old. _app.js
 * registers this file as `/sw.js?v=<Next build id>`, so every build installs a
 * worker at a URL the browser has not seen, under cache names carrying that
 * build id, and `activate` sweeps everything that is not this build's.
 *
 * CACHED MONEY IS STAMPED.
 * Anything written to the API cache carries X-SKhata-Cached-At, and anything
 * SERVED from it also carries X-SKhata-From-Cache. lib/api.js reads both back,
 * and the list screens render "Shown from this phone — last updated …" above
 * the figures with a Refresh beside it. Offline reads are a real feature for
 * this audience; labelling them is the fix, switching them off is not.
 */

// The build this worker belongs to, taken from its own registration URL.
const BUILD = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = `skhata-shell-${BUILD}`;
const API_CACHE = `skhata-api-${BUILD}`;
const CACHE_PREFIXES = ['skhata-shell-', 'skhata-api-', 'skhata-'];

const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/manifest.webmanifest', '/icons/icon-192.png'];

const CACHED_AT_HEADER = 'X-SKhata-Cached-At';
const FROM_CACHE_HEADER = 'X-SKhata-From-Cache';

// GET API path prefixes safe to serve from cache first: read-mostly views the
// app shows first. Auth is deliberately excluded and never cached.
const API_CACHE_PREFIXES = [
  '/api/public/shops',
  '/api/catalog',
  '/api/customers',
  '/api/products',
  '/api/shops/me',
];

// Routes that must NEVER be answered from cache, checked BEFORE the allow-list
// so a path cannot sneak in under a cacheable prefix. A stale payment status or
// order state is not a slightly old answer, it is a wrong one: it can tell a
// shopkeeper an order was paid when it was not, or show a customer a payment
// page for money that has already moved.
const NEVER_CACHE = [
  '/api/payments',
  '/api/orders',
  '/api/purchase-orders',
  '/api/auth',
  '/api/my/orders',
  '/api/delivery',
];

function matchesPrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isNeverCached(url) {
  if (NEVER_CACHE.some((p) => matchesPrefix(url.pathname, p))) return true;
  // A payment or order hanging off an otherwise cacheable resource, e.g.
  // /api/customers/<id>/payments.
  return /\/(payments?|orders?|checkout|pay)(\/|$)/.test(url.pathname);
}

function isCacheableApi(url) {
  if (isNeverCached(url)) return false;
  // Query strings live in url.search, so matching on pathname covers
  // e.g. /api/customers and /api/customers?status=active alike.
  return API_CACHE_PREFIXES.some((p) => matchesPrefix(url.pathname, p));
}

// A caller that explicitly asked for fresh data (the Refresh button on the
// stale-data notice) must not be handed the cache back.
function wantsFresh(request) {
  return request.cache === 'reload' || request.cache === 'no-store' || request.cache === 'no-cache';
}

// Rebuild a response with an extra header. Response headers are immutable, so
// the body has to be read and re-wrapped; it is only done for the small JSON
// payloads on the API path.
async function withHeader(response, name, value) {
  if (!response) return response;
  const body = await response.clone().arrayBuffer();
  const headers = new Headers(response.headers);
  headers.set(name, value);
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

// Stamp when this copy was taken, on the way INTO the cache.
function stampCachedAt(response, now) {
  return withHeader(response, CACHED_AT_HEADER, String(now == null ? Date.now() : now));
}

// Flag that this copy came OUT of the cache, on the way to the page.
function markFromCache(response) {
  return withHeader(response, FROM_CACHE_HEADER, '1');
}

// Exposed so the cache policy can be unit-tested (tests/sw-cache.test.js)
// without a browser. Harmless at runtime: it is a property on the worker's own
// global, invisible to the page.
self.skhataSwPolicy = {
  BUILD, CACHE, API_CACHE, API_CACHE_PREFIXES, NEVER_CACHE,
  isCacheableApi, isNeverCached, wantsFresh, stampCachedAt, markFromCache,
};

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          // Only this app's caches, and only the ones from another build.
          .filter((k) => CACHE_PREFIXES.some((p) => k.startsWith(p)))
          .filter((k) => k !== CACHE && k !== API_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// The app posts this on logout so a shared device doesn't leak the previous
// user's cached data.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_API_CACHE') {
    event.waitUntil(caches.delete(API_CACHE));
  }
});

// Fetch, cache a stamped copy, and hand the live response to the page.
function fetchAndCache(request, cacheName) {
  return fetch(request).then((resp) => {
    if (resp && resp.status === 200) {
      stampCachedAt(resp, Date.now())
        .then((stamped) => caches.open(cacheName).then((c) => c.put(request, stamped)))
        .catch(() => {});
    }
    return resp;
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/')) {
    // Whitelisted read-mostly GETs: stale-while-revalidate, with the cache as an
    // offline fallback. Auth, payments, orders and everything else fall through
    // to network-only.
    if (isCacheableApi(url)) {
      event.respondWith((async () => {
        const cached = await caches.match(request);
        const network = fetchAndCache(request, API_CACHE)
          .catch(() => (cached ? markFromCache(cached) : Promise.reject(new Error('offline'))));
        // An explicit refresh goes to the network first and only falls back to
        // the cache if there is genuinely nothing there.
        if (wantsFresh(request) || !cached) return network;
        // Otherwise answer instantly from the cache — flagged as not live — and
        // let the revalidation land in the cache for the next read.
        network.catch(() => {});
        return markFromCache(cached);
      })());
    }
    // All other /api/ GETs: network-only (return early, no interception).
    return;
  }

  // Page navigations: network-first, fall back to offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // Same-origin static assets: stale-while-revalidate.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetchAndCache(request, CACHE).catch(() => cached);
        return cached || network;
      })
    );
  }
});
