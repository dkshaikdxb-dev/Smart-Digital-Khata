import axios from 'axios';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const API_URL =
  Constants.expoConfig?.extra?.apiUrl || 'http://localhost:4000';

const api = axios.create({ baseURL: API_URL, timeout: 15000 });

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('skhata_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const auth = {
  async login(email, password) {
    const { data } = await api.post('/api/auth/login', { email, password });
    await SecureStore.setItemAsync('skhata_token', data.token);
    return data;
  },
  async logout() {
    await SecureStore.deleteItemAsync('skhata_token');
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
