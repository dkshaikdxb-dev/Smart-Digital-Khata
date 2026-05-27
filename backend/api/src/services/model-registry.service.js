const models = [];

const registerModel = async ({
  modelName,
  modelVersion,
  modelType,
  accuracy
}) => {
  const model = {
    id: `ML-${Date.now()}`,
    modelName,
    modelVersion,
    modelType,
    accuracy,
    registeredAt: new Date()
  };

  models.push(model);

  return model;
};

const getModels = async () => {
  return models;
};

module.exports = {
  registerModel,
  getModels
};
