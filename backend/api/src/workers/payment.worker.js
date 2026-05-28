const { Worker } = require('bullmq');
const redisConnection = require('../lib/redis');
const logger = require('../utils/logger');

const paymentWorker = new Worker(
  'payments',
  async job => {
    logger.info({
      message: 'Processing payment job',
      payload: job.data
    });

    return true;
  },
  {
    connection: redisConnection
  }
);

module.exports = paymentWorker;
