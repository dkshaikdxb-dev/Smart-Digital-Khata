const { Queue } = require('bullmq');
const redis = require('./redis');

const notificationQueue = new Queue('notifications', {
  connection: redis
});

const aiQueue = new Queue('ai-processing', {
  connection: redis
});

module.exports = {
  notificationQueue,
  aiQueue
};
