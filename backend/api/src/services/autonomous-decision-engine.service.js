const multiAgentRouter = require('./multi-agent-router.service');
const ragEngine = require('./rag-engine.service');
const workflowOrchestrator = require('./workflow-orchestrator.service');

const executeAutonomousDecision = async ({
  taskType,
  query,
  priority
}) => {
  const routedAgent = await multiAgentRouter.routeAgentTask({
    taskType,
    payload: { query }
  });

  const intelligence = await ragEngine.generateRAGResponse({
    query,
    provider: 'OPENAI'
  });

  await workflowOrchestrator.executeWorkflow({
    workflowType: 'AUTONOMOUS_DECISION',
    payload: {
      priority,
      entityId: taskType,
      query
    }
  });

  return {
    routedAgent,
    intelligence,
    executedAt: new Date()
  };
};

module.exports = {
  executeAutonomousDecision
};
