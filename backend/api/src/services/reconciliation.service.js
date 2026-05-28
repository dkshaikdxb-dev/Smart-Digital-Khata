const prisma = require('../lib/prisma');

const reconcilePayment = async paymentId => {
  const payment = await prisma.payment.findUnique({
    where: {
      id: paymentId
    }
  });

  return {
    reconciled: !!payment,
    payment
  };
};

module.exports = {
  reconcilePayment
};
