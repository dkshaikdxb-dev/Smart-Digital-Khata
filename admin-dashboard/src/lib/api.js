const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function tokenHeader() {
  if (typeof window === 'undefined') return {};
  const t = window.localStorage.getItem('skhata_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...tokenHeader(),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `HTTP ${res.status}`);
    // Expose the status so callers (e.g. the offline outbox) can tell a
    // permanent 4xx from a transient network/5xx failure. A rejected fetch
    // (truly offline) throws before here and carries no status at all.
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return res.json();
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
