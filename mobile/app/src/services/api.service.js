const API_BASE_URL = 'http://localhost:5000/api';

export const apiRequest = async (endpoint, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json'
    },
    ...options
  });

  return response.json();
};
