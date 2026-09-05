/* Smart Digital Khata — service worker
 * App-shell caching for fast loads + offline fallback.
 * Read-mostly API GETs are cached stale-while-revalidate so the app opens on
 * patchy 2G; writes and auth are never cached. In production nginx proxies
 * /api/ same-origin, so these requests are visible here.
 */
const CACHE = 'skhata-v2';
const API_CACHE = 'skhata-api-v2';
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/manifest.webmanifest', '/icons/icon-192.png'];

// GET API path prefixes safe to serve from cache first (read-mostly views the
// app shows first). Auth is deliberately excluded and never cached.
const API_CACHE_PREFIXES = [
  '/api/public/shops',
  '/api/catalog',
  '/api/customers',
  '/api/products',
  '/api/shops/me',
];

function isCacheableApi(url) {
  // Query strings live in url.search, so matching on pathname covers
  // e.g. /api/customers and /api/customers?status=active alike.
  return API_CACHE_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`));
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE && k !== API_CACHE).map((k) => caches.delete(k)))
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

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/')) {
    // Whitelisted read-mostly GETs: stale-while-revalidate, with the cache as an
    // offline fallback. Auth and everything else fall through to network-only.
    if (isCacheableApi(url)) {
      event.respondWith(
        caches.match(request).then((cached) => {
          const network = fetch(request)
            .then((resp) => {
              if (resp && resp.status === 200) {
                const copy = resp.clone();
                caches.open(API_CACHE).then((c) => c.put(request, copy));
              }
              return resp;
            })
            .catch(() => cached);
          return cached || network;
        })
      );
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
        const network = fetch(request)
          .then((resp) => {
            if (resp && resp.status === 200) {
              const copy = resp.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return resp;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});
