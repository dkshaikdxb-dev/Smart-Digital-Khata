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
};

export const transactions = {
  create: (body) => api.post('/api/transactions', body).then((r) => r.data),
  list: () => api.get('/api/transactions').then((r) => r.data),
};

export const summary = {
  today: () => api.get('/api/summaries/today').then((r) => r.data),
  outstanding: () => api.get('/api/summaries/outstanding').then((r) => r.data),
};

export default api;
