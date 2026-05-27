const aiMemory = require('./ai-memory.service');
const semanticInsights = require('./semantic-insights.service');
const workflowOrchestrator = require('./workflow-orchestrator.service');

const executeAgenticDecision = async ({
  merchantId,
  objective,
  priority
}) => {
  const memory = await aiMemory.recallContext({ merchantId });

  const insights = await semanticInsights.generateSemanticInsights({
    merchantId,
    query: objective
  });

  await workflowOrchestrator.executeWorkflow({
    workflowType: 'AGENTIC_AUTOMATION',
    payload: {
      merchantId,
      objective,
      priority,
      entityId: merchantId
    }
  });

  return {
    merchantId,
    objective,
    memoryCount: memory.length,
    insights,
    executedAt: new Date()
  };
};

module.exports = {
  executeAgenticDecision
};
