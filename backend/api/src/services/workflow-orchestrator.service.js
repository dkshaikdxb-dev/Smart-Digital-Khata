const eventBus = require('./event-bus.service');
const jobQueue = require('./job-queue.service');
const realtimeAlert = require('./realtime-alert.service');

const executeWorkflow = async ({ workflowType, payload }) => {
  await eventBus.publishEvent({
    type: workflowType,
    payload
  });

  await jobQueue.addJob({
    type: workflowType,
    payload
  });

  if (payload.priority === 'HIGH') {
    await realtimeAlert.triggerRealtimeAlert({
      severity: 'HIGH',
      message: `${workflowType} requires immediate attention`,
      entityId: payload.entityId || 'UNKNOWN'
    });
  }

  return {
    success: true,
    workflowType,
    executedAt: new Date()
  };
};

module.exports = {
  executeWorkflow
};
