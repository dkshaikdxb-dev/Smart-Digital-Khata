const { Worker } = require('bullmq');
const redisConnection = require('../lib/redis');
const logger = require('../utils/logger');

const notificationWorker = new Worker(
  'notifications',
  async job => {
    logger.info({
      message: 'Processing notification job',
      payload: job.data
    });

    return true;
  },
  {
    connection: redisConnection
  }
);

module.exports = notificationWorker;
