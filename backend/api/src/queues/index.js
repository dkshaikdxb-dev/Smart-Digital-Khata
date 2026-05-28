const { Queue } = require('bullmq');
const redisConnection = require('../lib/redis');

const notificationQueue = new Queue('notifications', {
  connection: redisConnection
});

const retryQueue = new Queue('retry-queue', {
  connection: redisConnection
});

module.exports = {
  notificationQueue,
  retryQueue
};
