const featureStore = require('./ml-feature-store.service');
const modelRegistry = require('./model-registry.service');

const executeTrainingPipeline = async ({
  modelName,
  modelType,
  trainingDataset
}) => {
  await featureStore.storeFeatures({
    entityType: 'MODEL_DATASET',
    entityId: modelName,
    features: trainingDataset
  });

  const model = await modelRegistry.registerModel({
    modelName,
    modelVersion: 'v1',
    modelType,
    accuracy: 87
  });

  return {
    success: true,
    model,
    trainedAt: new Date()
  };
};

module.exports = {
  executeTrainingPipeline
};
