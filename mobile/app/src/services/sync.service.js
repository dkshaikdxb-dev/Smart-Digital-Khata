import { apiRequest } from './api.service';

export const syncPendingCollections = async collections => {
  for (const collection of collections) {
    await apiRequest('/collections', {
      method: 'POST',
      body: JSON.stringify(collection)
    });
  }

  return true;
};
