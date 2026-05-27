const paymentTransactions = [];

const createPaymentLink = async ({
  customer,
  amount
}) => {
  const paymentLink = {
    id: `PAY-${Date.now()}`,
    customer,
    amount,
    paymentUrl: `https://pay.smartkhata.app/${Date.now()}`,
    createdAt: new Date()
  };

  paymentTransactions.push(paymentLink);

  return paymentLink;
};

const getPayments = async () => {
  return paymentTransactions;
};

module.exports = {
  createPaymentLink,
  getPayments
};
