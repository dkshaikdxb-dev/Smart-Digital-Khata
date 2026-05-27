const paymentService = require('../services/payment.service');

const generatePaymentLink = async (req, res) => {
  try {
    const paymentLink = await paymentService.createPaymentLink(req.body);

    return res.status(200).json({
      paymentLink
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to generate payment link',
      error: error.message
    });
  }
};

const getPayments = async (req, res) => {
  try {
    const payments = await paymentService.getPayments();

    return res.status(200).json({
      payments
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to fetch payments',
      error: error.message
    });
  }
};

module.exports = {
  generatePaymentLink,
  getPayments
};
