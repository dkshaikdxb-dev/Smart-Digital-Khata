'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

export default function useCustomers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const response = await apiRequest('/customers');

        setCustomers(response.data || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchCustomers();
  }, []);

  return {
    customers,
    loading,
    error
  };
}
