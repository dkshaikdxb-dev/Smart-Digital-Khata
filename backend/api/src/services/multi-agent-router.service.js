const routeAgentTask = async ({ taskType, payload }) => {
  let assignedAgent = 'GENERAL_AGENT';

  if (taskType === 'COLLECTIONS') {
    assignedAgent = 'COLLECTIONS_AGENT';
  }

  if (taskType === 'FRAUD') {
    assignedAgent = 'FRAUD_AGENT';
  }

  if (taskType === 'LENDING') {
    assignedAgent = 'LENDING_AGENT';
  }

  if (taskType === 'GROWTH') {
    assignedAgent = 'GROWTH_AGENT';
  }

  return {
    assignedAgent,
    payload,
    routedAt: new Date()
  };
};

module.exports = {
  routeAgentTask
};
