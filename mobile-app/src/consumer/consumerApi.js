import axios from 'axios';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

// Consumer API client. A SEPARATE axios instance and secure-store key from the
// owner app (services/api.js), so the two flavors never share a token. Base URL
// comes from the same expoConfig.extra.apiUrl the owner uses.
const API_URL = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:4000';

// Distinct from the owner's 'skhata_token' — a consumer install stores its own.
export const CONSUMER_TOKEN_KEY = 'skhata_consumer_token';

const api = axios.create({ baseURL: API_URL, timeout: 15000 });

// A single registered callback the app sets so ANY 401 (expired/blocked token)
// signs the consumer out and returns them to the login stack.
let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export async function getToken() {
  try {
    return await SecureStore.getItemAsync(CONSUMER_TOKEN_KEY);
  } catch (e) {
    return null;
  }
}

export async function setToken(token) {
  await SecureStore.setItemAsync(CONSUMER_TOKEN_KEY, token);
}

export async function clearToken() {
  try {
    await SecureStore.deleteItemAsync(CONSUMER_TOKEN_KEY);
  } catch (e) { /* ignore */ }
}

api.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Expired or revoked session — drop it and bounce to login.
      clearToken();
      if (onUnauthorized) onUnauthorized();
    }
    return Promise.reject(normalizeError(error));
  }
);

// Turn an axios error into a plain Error carrying the server's message when it
// sent one (ApiError responses are { error: { message } } or { message }).
function normalizeError(error) {
  const data = error.response && error.response.data;
  const msg =
    (data && (data.error?.message || data.message)) ||
    error.message ||
    'Something went wrong';
  const e = new Error(msg);
  e.status = error.response && error.response.status;
  return e;
}

// ---- Auth (OTP) -----------------------------------------------------------
export const consumerAuth = {
  // POST /api/customer-auth/request-otp { phone } -> { ok, dev_code? }
  requestOtp: (phone) =>
    api.post('/api/customer-auth/request-otp', { phone }).then((r) => r.data),
  // POST /api/customer-auth/verify-otp { phone, code } -> { token, customer_user }
  verifyOtp: (phone, code) =>
    api.post('/api/customer-auth/verify-otp', { phone, code }).then((r) => r.data),
  // GET /api/customer-auth/me -> { customer_user, shops, has_pin, phone, token? }
  me: () => api.get('/api/customer-auth/me').then((r) => r.data),
  // PATCH /api/customer-auth/profile { name,email,gender,date_of_birth } -> { customer_user }
  updateProfile: (body) =>
    api.patch('/api/customer-auth/profile', body).then((r) => r.data),
};

// ---- Self / khata (Bearer) ------------------------------------------------
export const my = {
  // GET /api/my/khata -> { total_outstanding, shops:[{shop_id,shop_name,customer_id,balance,credit_limit}] }
  khata: () => api.get('/api/my/khata').then((r) => r.data),
  // GET /api/my/khata/:shopId -> { shop_name, customer_id, balance, transactions:[...] }
  shopKhata: (shopId) => api.get(`/api/my/khata/${shopId}`).then((r) => r.data),
  // POST /api/my/pay { shop_id, amount } -> 201 { link, order_id }  (amount = integer paise)
  pay: (shopId, amountPaise) =>
    api.post('/api/my/pay', { shop_id: shopId, amount: amountPaise }).then((r) => r.data),
  // GET /api/my/orders -> { items:[...] }
  orders: () => api.get('/api/my/orders').then((r) => r.data),
  // GET /api/my/orders/:id -> { order:{...,items} }
  order: (id) => api.get(`/api/my/orders/${id}`).then((r) => r.data),
  // POST /api/my/orders { shop_id, items, fulfillment_type, payment_mode, address, note } -> 201 { order, pay_link? }
  createOrder: (body) => api.post('/api/my/orders', body).then((r) => r.data),
  // POST /api/my/orders/:id/cancel -> { order }
  cancelOrder: (id) => api.post(`/api/my/orders/${id}/cancel`).then((r) => r.data),
};

// ---- Public (no auth) -----------------------------------------------------
export const publicApi = {
  // GET /api/public/shops?search=&city=&lat=&lng=&limit= -> { shops:[...] }
  shops: (params = {}) => {
    const q = new URLSearchParams();
    if (params.search) q.set('search', String(params.search).trim());
    if (params.city) q.set('city', String(params.city).trim());
    if (params.lat != null && params.lng != null) {
      q.set('lat', String(params.lat));
      q.set('lng', String(params.lng));
    }
    q.set('limit', String(params.limit || 50));
    return api.get(`/api/public/shops?${q.toString()}`).then((r) => r.data);
  },
  // GET /api/public/shops/:shopId -> { shop:{...,products:[...]} }
  shop: (shopId) => api.get(`/api/public/shops/${shopId}`).then((r) => r.data),
};

export default api;
