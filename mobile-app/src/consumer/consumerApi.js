import axios from 'axios';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

// Consumer API client. A SEPARATE axios instance and secure-store key from the
// owner app (services/api.js), so the two flavors never share a token. Base URL
// comes from the same expoConfig.extra.apiUrl the owner uses.
const API_URL = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:4000';

// The API base the app talks to — exported so screens can resolve relative
// asset paths (e.g. product images) against the same origin.
export const API_BASE_URL = API_URL;

// Resolve a product image_url for <Image>. It may be an absolute URL
// (http/https — used as-is) or a backend-relative path like '/uploads/x.jpg'
// (prefixed with the API base). Returns null for empty/missing values so the
// caller can show a graceful placeholder instead of a broken image.
export function resolveImageUrl(u) {
  const s = u == null ? '' : String(u).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  const base = API_URL.replace(/\/+$/, '');
  const path = s.replace(/^\/+/, '');
  return `${base}/${path}`;
}

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
// sent one.
//
// THE ENVELOPE THIS LOOKED FOR DID NOT EXIST. This read `data.error?.message`,
// i.e. it expected `{ error: { message } }`. What middleware/errorHandler.js
// actually sends is `{ error: <string>, details }` — `error` IS the message.
// `data.error?.message` on a string is undefined, `data.message` is undefined,
// so EVERY http failure fell through to axios's own text and `e.message` became
// "Request failed with status code 422".
//
// The server's reason was therefore never available to any screen. That is why
// a shopper whose order hit their khata limit was told "Something in that was
// not right" — the only thing errorText.js had left to go on was the status.
// It also silently defeated refusalError(), which exists precisely to show the
// server's words and was showing axios's instead.
//
// Both shapes are read now, string first. `e.code` is left alone: for the 409
// the server sends `error: 'shop_closed'`, and shopClosedMessage matches on it.
function serverMessage(data) {
  if (!data) return null;
  if (typeof data.error === 'string' && data.error) return data.error;
  if (data.error && typeof data.error.message === 'string' && data.error.message) return data.error.message;
  if (typeof data.message === 'string' && data.message) return data.message;
  return null;
}

function normalizeError(error) {
  const data = error.response && error.response.data;
  const msg = serverMessage(data) || error.message || 'Something went wrong';
  const e = new Error(msg);
  e.status = error.response && error.response.status;
  // Keep the TYPED part of the failure. The backend answers a refusal as
  // { error: '<code>', details: {...} } — e.g. the 409 `shop_closed` from batch
  // A with { reason, reopens_at } — and a screen can only say WHY and WHEN if
  // those survive the normalization. The message is unchanged.
  e.code = (data && data.error) || null;
  e.details = (data && data.details) || null;
  // Keep the TRANSPORT part of the failure too. A request that never reached
  // the server carries no status and no code, so without this tag a screen
  // cannot tell "you have no signal" from "the shop's server is slow" from "we
  // cancelled this ourselves because you kept typing" — and it ends up showing
  // the raw axios text ("Network Error", "timeout of 15000ms exceeded") to a
  // shopper. lib/errorText.js maps this to an authored sentence.
  if (axios.isCancel && axios.isCancel(error)) e.transport = 'cancelled';
  else if (error.code === 'ERR_CANCELED') e.transport = 'cancelled';
  else if (error.code === 'ECONNABORTED' || /timeout/i.test(String(error.message))) e.transport = 'timeout';
  else if (!error.response) e.transport = 'offline';
  else e.transport = null;
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
  // Self-service number change. BOTH steps require the current session; the
  // second also proves control of the new number with a code sent to it. On
  // success the server returns a token that authenticates as the (possibly
  // merged) identity on the new number, so the caller must store it.
  // POST /api/customer-auth/change-number/request { new_phone } -> { ok, dev_code? }
  changeNumberRequest: (newPhone) =>
    api
      .post('/api/customer-auth/change-number/request', { new_phone: newPhone })
      .then((r) => r.data),
  // POST /api/customer-auth/change-number/verify { new_phone, code } -> { token, customer_user }
  changeNumberVerify: (newPhone, code) =>
    api
      .post('/api/customer-auth/change-number/verify', { new_phone: newPhone, code })
      .then((r) => r.data),
  // GET /api/customer-auth/referral ->
  //   { code, link_path, link, counts:{referred_total,activated_total},
  //     reward:{accrued_paise}, referred:[...], referred_by }
  // accrued_paise is integer paise (a bigint on the wire) — never divided here.
  referral: () => api.get('/api/customer-auth/referral').then((r) => r.data),
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
  // GET /api/my/buy-again?limit= -> { items:[{name,shop_id,shop_name,times,last_ordered_at}] }
  // The shopper's own previously ordered items, most frequent first. NO PRICE
  // is returned and none should be asked for: a price is a per-shop lookup and
  // this screen is drawn on 2G.
  //
  // DEPLOY ORDER: this endpoint does not exist on a server older than the batch
  // that added it, and the app bundle can reach a phone before that server is
  // updated. Every failure — a 404 from an old server, a 400, a dead radio, a
  // 2G timeout — resolves to an EMPTY list rather than rejecting, because the
  // section this feeds renders nothing at all when it is empty. An older
  // backend therefore produces a screen with one section missing, which is
  // exactly the screen a brand-new shopper gets, and never a broken one.
  //
  // A 401 is deliberately NOT swallowed here in spirit — the axios interceptor
  // has already cleared the token and bounced to login by the time this runs,
  // so returning an empty list is simply what is left to do.
  buyAgain: (limit) =>
    api
      .get(`/api/my/buy-again?limit=${encodeURIComponent(String(limit || 8))}`)
      .then((r) => (r.data && Array.isArray(r.data.items) ? r.data.items : []))
      .catch(() => []),
  // GET /api/my/orders/:id -> { order:{...,items} }
  order: (id) => api.get(`/api/my/orders/${id}`).then((r) => r.data),
  // POST /api/my/orders { shop_id, items, fulfillment_type, payment_mode, address, note } -> 201 { order, pay_link? }
  createOrder: (body) => api.post('/api/my/orders', body).then((r) => r.data),
  // POST /api/my/orders/:id/cancel -> { order }
  cancelOrder: (id) => api.post(`/api/my/orders/${id}/cancel`).then((r) => r.data),
  // GET /api/my/statement?shop_id=&from=&to= ->
  //   with shop_id: { from, to, shop: { shop_name, statement } }
  //   without:      { from, to, shops: [{shop_id,shop_name,statement}], combined }
  // A statement is { opening, closing, total_purchases, total_paid,
  // total_adjusted, lines:[{id,type,amount,balance,note,created_at}] }, every
  // figure integer paise. The SAME builder serves the owner endpoint, so the
  // opening/closing arithmetic a shopper argues with at the counter is the
  // arithmetic the shopkeeper sees. `format=csv` exists but is deliberately not
  // wired here — see StatementScreen for why a phone hands that to the web.
  statement: ({ shopId, from, to } = {}) => {
    const q = new URLSearchParams();
    if (shopId) q.set('shop_id', String(shopId));
    if (from) q.set('from', String(from));
    if (to) q.set('to', String(to));
    return api.get(`/api/my/statement?${q.toString()}`).then((r) => r.data);
  },
};

// ---- Public (no auth) -----------------------------------------------------
export const publicApi = {
  // GET /api/public/shops?search=&city=&lat=&lng=&lang=&limit= -> { shops:[...] }
  shops: (params = {}) => {
    const q = new URLSearchParams();
    if (params.search) q.set('search', String(params.search).trim());
    if (params.city) q.set('city', String(params.city).trim());
    if (params.lat != null && params.lng != null) {
      q.set('lat', String(params.lat));
      q.set('lng', String(params.lng));
    }
    // Selected app language — the API localizes names, English is the fallback.
    if (params.lang) q.set('lang', String(params.lang));
    q.set('limit', String(params.limit || 50));
    return api.get(`/api/public/shops?${q.toString()}`).then((r) => r.data);
  },
  // GET /api/public/shops/:shopId?lang=<code> -> { shop:{...,products:[...]} }
  // `lang` localizes product names (English fallback for unknown/blank).
  shop: (shopId, lang) => {
    const q = lang ? `?lang=${encodeURIComponent(String(lang))}` : '';
    return api.get(`/api/public/shops/${shopId}${q}`).then((r) => r.data);
  },
  // GET /api/public/products/search?q=&category=&lang=&limit= -> { products:[...] }
  // Cross-shop product search — the SAME endpoint the web PWA's /c/products
  // page uses, so both surfaces rank and localize identically. `signal` lets a
  // caller abort a superseded request instead of paying for it on 2G; the
  // rejection then carries transport 'cancelled' and is silently dropped.
  //
  // `category` is a SHELF KEY (see lib/categories.js), sent instead of a
  // keyword. DEPLOY ORDER: the backend ships before the app bundle does, but
  // the reverse is what actually hurts — an app that has already updated
  // talking to a server that has not. A server without the shelf filter drops
  // the unknown param and then 400s for want of the `q` it still requires, so a
  // shelf request that comes back 400 (or 404, or 422) is retried ONCE with
  // `fallbackTerm`, which is the very keyword that chip used before this
  // change. The shopper sees the old, narrower results — never an error, never
  // an empty screen — and nothing has to be sequenced.
  searchProducts: ({ q, category, fallbackTerm, lang, limit, signal } = {}) => {
    const build = (term, shelf) => {
      const params = new URLSearchParams();
      const text = String(term == null ? '' : term).trim();
      if (text) params.set('q', text);
      if (shelf) params.set('category', String(shelf));
      if (lang) params.set('lang', String(lang));
      params.set('limit', String(limit || 30));
      return `/api/public/products/search?${params.toString()}`;
    };
    const opts = signal ? { signal } : undefined;
    const first = api.get(build(q, category), opts).then((r) => r.data);
    if (!category) return first;
    return first.catch((err) => {
      // Only a REFUSAL is retried. A timeout or a dead radio is the shopper's
      // network and must surface as itself; retrying it would double the wait
      // on 2G and then report the same failure anyway.
      const status = err && err.status;
      const oldServer = status === 400 || status === 404 || status === 422;
      const term = String(fallbackTerm || q || '').trim();
      if (!oldServer || !term) throw err;
      return api.get(build(term, null), opts).then((r) => r.data);
    });
  },
};

export default api;
