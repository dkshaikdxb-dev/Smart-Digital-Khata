import axios from 'axios';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const API_URL =
  Constants.expoConfig?.extra?.apiUrl || 'http://localhost:4000';

// The owner session lives in SecureStore until sign-out (or token expiry), so
// the app can restore it on launch instead of asking for credentials every
// open. The role is stored alongside the token so boot can pick the right
// screen (owner tabs vs the admin web-console notice) without a network call.
const TOKEN_KEY = 'skhata_token';
const ROLE_KEY = 'skhata_role';

// A single registered callback the app sets so ANY 401 (expired/revoked token)
// clears the session and returns the owner to the Login screen.
let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export async function getToken() {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch (e) {
    return null;
  }
}

export async function getRole() {
  try {
    return await SecureStore.getItemAsync(ROLE_KEY);
  } catch (e) {
    return null;
  }
}

async function saveSession(token, role) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  try {
    if (role) await SecureStore.setItemAsync(ROLE_KEY, role);
    else await SecureStore.deleteItemAsync(ROLE_KEY);
  } catch (e) { /* role is best-effort; token is what gates the session */ }
}

export async function clearSession() {
  try { await SecureStore.deleteItemAsync(TOKEN_KEY); } catch (e) { /* ignore */ }
  try { await SecureStore.deleteItemAsync(ROLE_KEY); } catch (e) { /* ignore */ }
}

const api = axios.create({ baseURL: API_URL, timeout: 20000 });

// Retry tuning. Two retries (three attempts total) with a short, growing
// backoff so a cold-start blip self-heals instead of surfacing as a dead error.
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = [400, 1000];

// A failure worth retrying is a TRANSIENT one: no HTTP response at all (network
// error), a client timeout (ECONNABORTED), or a 5xx from the server. Any 4xx
// (400/401/404/…) is a real answer and is NOT retried.
function isTransient(error) {
  if (!error) return false;
  if (error.code === 'ECONNABORTED') return true; // timeout
  if (!error.response) return true; // network error (no response received)
  const status = error.response.status;
  return status >= 500 && status <= 599;
}

api.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 401 handler — kept as-is: any 401 clears the session and bounces to login. It
// runs first and simply re-rejects, so the retry interceptor below never retries
// a 401 (it's a 4xx and not transient).
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Expired or revoked session — drop it and bounce to login.
      clearSession();
      if (onUnauthorized) onUnauthorized();
    }
    return Promise.reject(error);
  }
);

// Retry interceptor — composed after the 401 handler. Retries only transient
// failures, at most MAX_RETRIES times, with a growing backoff tracked on the
// request config. Re-runs through the same axios instance so the request
// interceptor re-attaches the Bearer token. Never throws synchronously and can
// never loop past the cap.
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const config = error && error.config;
    if (!config || !isTransient(error)) return Promise.reject(error);

    const attempted = config.__retryCount || 0;
    if (attempted >= MAX_RETRIES) return Promise.reject(error);

    config.__retryCount = attempted + 1;
    const base = RETRY_BACKOFF_MS[attempted] || RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
    const wait = base + Math.floor(Math.random() * 100); // tiny jitter
    await new Promise((resolve) => setTimeout(resolve, wait));
    return api(config);
  }
);

export const auth = {
  async login(email, password) {
    const { data } = await api.post('/api/auth/login', { email, password });
    await saveSession(data.token, data.user?.role || 'owner');
    return data;
  },
  async logout() {
    await clearSession();
  },
};

export const customers = {
  list: (search = '') => api.get(`/api/customers?search=${encodeURIComponent(search)}`).then((r) => r.data),
  create: (body) => api.post('/api/customers', body).then((r) => r.data),
  get: (id) => api.get(`/api/customers/${id}`).then((r) => r.data),
  ledger: (id) => api.get(`/api/customers/${id}/ledger`).then((r) => r.data),
  update: (id, body) => api.patch(`/api/customers/${id}`, body).then((r) => r.data),
};

export const transactions = {
  create: (body) => api.post('/api/transactions', body).then((r) => r.data),
  list: (params = '') => api.get(`/api/transactions${params}`).then((r) => r.data),
};

export const summary = {
  today: () => api.get('/api/summaries/today').then((r) => r.data),
  outstanding: () => api.get('/api/summaries/outstanding').then((r) => r.data),
};

export const products = {
  list: (search = '') => api.get(`/api/products?search=${encodeURIComponent(search)}`).then((r) => r.data),
  create: (body) => api.post('/api/products', body).then((r) => r.data),
  update: (id, body) => api.patch(`/api/products/${id}`, body).then((r) => r.data),
  remove: (id) => api.delete(`/api/products/${id}`).then((r) => r.data),
};

// Inbuilt base catalogue (owner/staff, shop-scoped). `list` browses the shared
// catalogue annotated with whether this shop already carries each item; `select`
// adds (or reprices) an item into the shop at an integer-paise price.
export const catalog = {
  list: ({ search = '', lang = '', cursor = '', limit } = {}) => {
    const parts = [];
    if (search) parts.push(`search=${encodeURIComponent(search)}`);
    if (lang) parts.push(`lang=${encodeURIComponent(lang)}`);
    if (cursor) parts.push(`cursor=${encodeURIComponent(cursor)}`);
    if (limit != null && limit !== '') parts.push(`limit=${encodeURIComponent(limit)}`);
    const qs = parts.length ? `?${parts.join('&')}` : '';
    return api.get(`/api/catalog${qs}`).then((r) => r.data);
  },
  select: (catalogItemId, pricePaise) =>
    api.post('/api/catalog/select', { catalog_item_id: catalogItemId, price: pricePaise }).then((r) => r.data),
};

export const orders = {
  list: (status = '') => {
    const qs = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
    return api.get(`/api/orders${qs}`).then((r) => r.data);
  },
  get: (id) => api.get(`/api/orders/${id}`).then((r) => r.data),
  setStatus: (id, status) => api.patch(`/api/orders/${id}/status`, { status }).then((r) => r.data),
};

export const families = {
  list: () => api.get('/api/families').then((r) => r.data),
  create: (body) => api.post('/api/families', body).then((r) => r.data),
  get: (id) => api.get(`/api/families/${id}`).then((r) => r.data),
  addMember: (id, body) => api.post(`/api/families/${id}/members`, body).then((r) => r.data),
  removeMember: (id, customerId) => api.delete(`/api/families/${id}/members/${customerId}`).then((r) => r.data),
  statement: (id) => api.get(`/api/families/${id}/statement`).then((r) => r.data),
  remind: (id) => api.post(`/api/families/${id}/remind`).then((r) => r.data),
};

export const analytics = {
  overview: (days = 30) => api.get(`/api/analytics/overview?days=${days}`).then((r) => r.data),
  aging: () => api.get('/api/analytics/aging').then((r) => r.data),
};

export const shop = {
  me: () => api.get('/api/shops/me').then((r) => r.data),
  update: (body) => api.patch('/api/shops/me', body).then((r) => r.data),
  payment: () => api.get('/api/shops/me/payment').then((r) => r.data),
  updatePayment: (body) => api.patch('/api/shops/me/payment', body).then((r) => r.data),
  testPayment: () => api.post('/api/shops/me/payment/test').then((r) => r.data),
};

export default api;
