const logger = require('../utils/logger');

// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  if (status >= 500) {
    logger.error({ err, path: req.path }, 'Unhandled error');
  } else {
    logger.warn({ msg: err.message, path: req.path }, 'Request error');
  }
  res.status(status).json({
    error: err.message || 'Internal server error',
    details: err.details,
  });
};
