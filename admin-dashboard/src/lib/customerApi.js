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
    throw new Error(body.error || `HTTP ${res.status}`);
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
    throw new Error(body.error || `HTTP ${res.status}`);
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
