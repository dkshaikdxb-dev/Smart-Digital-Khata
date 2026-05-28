const { Worker } = require('bullmq');
const redisConnection = require('../lib/redis');
const logger = require('../utils/logger');

const retryWorker = new Worker(
  'retry-queue',
  async job => {
    logger.info({
      message: 'Retrying failed operation',
      payload: job.data
    });

    return true;
  },
  {
    connection: redisConnection
  }
);

module.exports = retryWorker;
