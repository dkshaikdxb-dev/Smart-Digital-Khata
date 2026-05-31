const prisma = require('../lib/prisma');

const createPaymentLink = async ({ customerId, amount, provider = 'RAZORPAY' }) => {
  const payment = await prisma.payment.create({
    data: {
      customerId,
      amount: Number(amount),
      provider,
      status: 'PENDING',
      transactionRef: `PAY-${Date.now()}`
    }
  });

  return {
    ...payment,
    paymentUrl: `https://pay.smartkhata.app/${payment.transactionRef}`
  };
};

const getPayments = async () => {
  return prisma.payment.findMany({
    orderBy: {
      createdAt: 'desc'
    }
  });
};

module.exports = {
  createPaymentLink,
  getPayments
};