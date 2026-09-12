// Customer PWA API client — a sibling of api.js that reads the CUSTOMER token
// (`ckhata_token`, role 'customer') so it never collides with the owner app's
// `skhata_token`. Same base URL, JSON parsing and error handling as apiFetch.
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const CUSTOMER_TOKEN_KEY = 'ckhata_token';
export const CUSTOMER_PHONE_KEY = 'ckhata_phone';

function tokenHeader() {
  if (typeof window === 'undefined') return {};
  const t = window.localStorage.getItem(CUSTOMER_TOKEN_KEY);
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// Build the Error for a non-2xx response. The message is unchanged (the
// server's `error` string), but the status and the parsed body ride along so a
// caller can act on a TYPED failure — e.g. the 409 `shop_closed` from batch A,
// whose `details: { reason, reopens_at }` becomes a readable sentence instead
// of a raw error code. Mirrors apiFetch's error shape in lib/api.js.
function httpError(res, body) {
  const err = new Error(body.error || `HTTP ${res.status}`);
  err.status = res.status;
  err.body = body;
  err.details = body.details;
  return err;
}

export async function customerFetch(path, options = {}) {
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
    throw httpError(res, body);
  }
  return res.json();
}

// Public (no-token) discovery/catalog reads still go through the same base URL
// and error handling, without attaching the customer token.
export async function publicFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw httpError(res, body);
  }
  return res.json();
}

// --- token helpers -------------------------------------------------------
export function getCustomerToken() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(CUSTOMER_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setCustomerToken(token, phone) {
  try {
    window.localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
    if (phone) window.localStorage.setItem(CUSTOMER_PHONE_KEY, phone);
  } catch {
    /* private mode / storage blocked — nothing we can do */
  }
}

export function clearCustomerToken() {
  try {
    window.localStorage.removeItem(CUSTOMER_TOKEN_KEY);
    window.localStorage.removeItem(CUSTOMER_PHONE_KEY);
  } catch {
    /* ignore */
  }
}

// Swap in a token returned by the server after a successful number change, PIN
// login, or a long-session refresh. Stores the new token (+phone) so every
// subsequent request authenticates as the resulting identity. Identical to
// setCustomerToken but named for that intent at the call sites.
export function swapCustomerToken(token, phone) {
  if (!token) return;
  setCustomerToken(token, phone);
}
