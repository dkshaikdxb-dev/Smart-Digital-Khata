const logger = require('../utils/logger');

const retryPayment = async paymentId => {
  logger.info({
    message: 'Retrying failed payment',
    paymentId
  });

  return {
    success: true
  };
};

module.exports = {
  retryPayment
};
