const Redis = require('ioredis');
const env = require('../config/env.config');

const redis = new Redis(env.redisUrl);

module.exports = redis;
