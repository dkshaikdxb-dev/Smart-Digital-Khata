const runInference = async ({
  modelName,
  input,
  threshold
}) => {
  const confidenceScore = Math.floor(Math.random() * 100);

  return {
    modelName,
    prediction: confidenceScore > threshold ? 'POSITIVE' : 'NEGATIVE',
    confidenceScore,
    predictedAt: new Date(),
    input
  };
};

module.exports = {
  runInference
};
