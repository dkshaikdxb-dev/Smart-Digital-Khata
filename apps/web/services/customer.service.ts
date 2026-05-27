import api from '../lib/api';

export const fetchCustomers = async () => {
  const response = await api.get('/customers');

  return response.data;
};

export const createCustomer = async (payload: {
  name: string;
  mobile?: string;
  shopId: string;
}) => {
  const response = await api.post('/customers', payload);

  return response.data;
};
