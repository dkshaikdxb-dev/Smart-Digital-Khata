const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// How long to wait before calling a request dead. On 2G a slow request is
// normal and a hung one is common; without this the spinner stayed up forever
// and the shopkeeper had no way to tell "still coming" from "never coming".
// Pass `timeoutMs: 0` for a call that legitimately takes longer (an upload).
const DEFAULT_TIMEOUT_MS = 25000;

function tokenHeader() {
  if (typeof window === 'undefined') return {};
  const t = window.localStorage.getItem('skhata_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// Headers the service worker stamps onto anything it answers from its own
// cache, so a screen can say the figures on it are not live. See public/sw.js.
const FROM_CACHE_HEADER = 'x-skhata-from-cache';
const CACHED_AT_HEADER = 'x-skhata-cached-at';

function readCacheMeta(res) {
  try {
    const fromCache = res.headers.get(FROM_CACHE_HEADER) === '1';
    const raw = res.headers.get(CACHED_AT_HEADER);
    const cachedAt = raw && Number.isFinite(Number(raw)) ? Number(raw) : null;
    return { fromCache, cachedAt };
  } catch (e) {
    return { fromCache: false, cachedAt: null };
  }
}

/**
 * The one request path. Returns the parsed body plus whether it came off this
 * phone's cache, so a caller rendering money can label a stale figure.
 *
 * Every rejection carries the shape lib/errorText.js reads:
 *   err.status      HTTP status (absent when the request never reached a server)
 *   err.body        the parsed JSON error body, including a typed `details.code`
 *   err.timeout     true when we gave up waiting
 *   err.requestPath the path, so support can be told WHICH call failed
 * The message itself is never shown to a shopkeeper.
 */
export async function apiFetchMeta(path, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = options;

  let controller = null;
  let timer = null;
  if (timeoutMs > 0 && typeof AbortController !== 'undefined' && !init.signal) {
    controller = new AbortController();
    timer = setTimeout(() => controller.abort(), timeoutMs);
  }

  let res;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      ...(controller ? { signal: controller.signal } : {}),
      headers: {
        'Content-Type': 'application/json',
        ...tokenHeader(),
        ...(init.headers || {}),
      },
    });
  } catch (err) {
    // An abort we caused is a timeout; anything else here is the network.
    if (controller && controller.signal.aborted) err.timeout = true;
    err.requestPath = path;
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `HTTP ${res.status}`);
    // Expose the status so callers (e.g. the offline outbox) can tell a
    // permanent 4xx from a transient network/5xx failure. A rejected fetch
    // (truly offline) throws before here and carries no status at all.
    err.status = res.status;
    err.body = body;
    err.requestPath = path;
    throw err;
  }

  const data = await res.json();
  return { data, ...readCacheMeta(res) };
}

export async function apiFetch(path, options = {}) {
  const { data } = await apiFetchMeta(path, options);
  return data;
}

// Authenticated POST helper, kept thin so the offline outbox can replay records
// as apiPost(url, body).
export function apiPost(path, body) {
  return apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
}

// Ask the service worker to drop its cached API responses. Called on logout so a
// shared device doesn't leak the previous user's cached data.
export function clearApiCache() {
  try {
    if (typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_API_CACHE' });
    }
  } catch (e) { /* best-effort */ }
}
