const featureStore = [];

const storeFeatures = async ({ entityType, entityId, features }) => {
  const record = {
    id: `FS-${Date.now()}`,
    entityType,
    entityId,
    features,
    createdAt: new Date()
  };

  featureStore.push(record);

  return record;
};

const getFeatures = async () => {
  return featureStore;
};

module.exports = {
  storeFeatures,
  getFeatures
};
