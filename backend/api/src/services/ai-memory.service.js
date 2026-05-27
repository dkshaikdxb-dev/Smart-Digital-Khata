const memoryStore = [];

const rememberContext = async ({ merchantId, contextType, context }) => {
  const memory = {
    id: `MEM-${Date.now()}`,
    merchantId,
    contextType,
    context,
    storedAt: new Date()
  };

  memoryStore.push(memory);

  return memory;
};

const recallContext = async ({ merchantId }) => {
  return memoryStore.filter(memory => memory.merchantId === merchantId);
};

module.exports = {
  rememberContext,
  recallContext
};
