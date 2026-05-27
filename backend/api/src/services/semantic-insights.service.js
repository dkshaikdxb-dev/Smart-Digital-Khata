const vectorMemory = require('./vector-memory.service');

const generateSemanticInsights = async ({ merchantId, query }) => {
  const semanticResults = await vectorMemory.semanticSearch({ query });

  return {
    merchantId,
    query,
    semanticInsights: semanticResults.matches,
    generatedAt: new Date()
  };
};

module.exports = {
  generateSemanticInsights
};
