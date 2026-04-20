const IORedis = require('ioredis');

const connection = new IORedis(process.env.REDIS_URL || 'redis://redis:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

connection.on('error', (e) => {
  // eslint-disable-next-line no-console
  console.error('[redis] error', e.message);
});

module.exports = { connection };
