const notificationWorker = require('../workers/notification.worker');
const retryWorker = require('../workers/retry.worker');

const bootstrapRuntime = async () => {
  console.log('Initializing runtime orchestration...');

  return {
    notificationWorker,
    retryWorker,
    initialized: true
  };
};

module.exports = {
  bootstrapRuntime
};
