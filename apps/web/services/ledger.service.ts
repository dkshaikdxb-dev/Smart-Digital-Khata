import api from '../lib/api';

export const fetchLedgerEntries = async () => {
  const response = await api.get('/ledger');

  return response.data;
};

export const createLedgerEntry = async (payload: {
  customerId: string;
  amount: number;
  type: string;
  note?: string;
}) => {
  const response = await api.post('/ledger', payload);

  return response.data;
};
