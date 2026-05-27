const vectorMemory = require('./vector-memory.service');
const llmGateway = require('./llm-gateway.service');

const generateRAGResponse = async ({ query, provider }) => {
  const semanticResults = await vectorMemory.semanticSearch({
    query
  });

  const llmResponse = await llmGateway.generateLLMResponse({
    provider,
    prompt: query,
    context: semanticResults.matches
  });

  return {
    query,
    contextMatches: semanticResults.matches,
    response: llmResponse.response,
    generatedAt: new Date()
  };
};

module.exports = {
  generateRAGResponse
};
