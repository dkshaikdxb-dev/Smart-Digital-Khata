const prisma = require('../lib/prisma');

const createRefund = async payload => {
  return prisma.payment.update({
    where: {
      id: payload.paymentId
    },
    data: {
      status: 'FAILED'
    }
  });
};

module.exports = {
  createRefund
};
