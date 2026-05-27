const vectors = [];

const storeEmbedding = async ({ entityId, entityType, embedding, metadata }) => {
  const vector = {
    id: `VEC-${Date.now()}`,
    entityId,
    entityType,
    embedding,
    metadata,
    createdAt: new Date()
  };

  vectors.push(vector);

  return vector;
};

const semanticSearch = async ({ query }) => {
  return {
    query,
    matches: vectors.slice(0, 5),
    searchedAt: new Date()
  };
};

module.exports = {
  storeEmbedding,
  semanticSearch
};
