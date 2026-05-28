import { syncPendingCollections } from '../services/sync.service';

export const runBackgroundSync = async pendingCollections => {
  return syncPendingCollections(pendingCollections);
};
