import api from '../lib/api';

export const loginMerchant = async (payload: {
  mobile: string;
  password: string;
}) => {
  const response = await api.post('/auth/login', payload);

  return response.data;
};

export const registerMerchant = async (payload: {
  name: string;
  mobile: string;
  password: string;
}) => {
  const response = await api.post('/auth/register', payload);

  return response.data;
};
