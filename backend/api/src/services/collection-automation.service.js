const logger = require('../utils/logger');

const runCollectionAutomation = async customer => {
  logger.info({
    message: 'Running automated collection workflow',
    customer
  });

  return {
    success: true
  };
};

module.exports = {
  runCollectionAutomation
};
