const logger = require('../utils/logger');

const httpLogger = (req, res, next) => {
  logger.info({
    method: req.method,
    url: req.originalUrl
  });

  next();
};

module.exports = httpLogger;
