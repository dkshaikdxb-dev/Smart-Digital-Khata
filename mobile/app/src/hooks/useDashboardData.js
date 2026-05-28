import { useEffect, useState } from 'react';
import { apiRequest } from '../services/api.service';

export default function useDashboardData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      const response = await apiRequest('/dashboard');

      setData(response.data);
      setLoading(false);
    };

    fetchDashboardData();
  }, []);

  return {
    data,
    loading
  };
}
