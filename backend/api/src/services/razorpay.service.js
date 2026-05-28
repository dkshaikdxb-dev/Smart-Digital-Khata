const Razorpay = require('razorpay');
const env = require('../config/env.config');

const razorpay = new Razorpay({
  key_id: env.razorpayKey,
  key_secret: env.razorpaySecret
});

const createPaymentLink = async ({ amount, customer }) => {
  return razorpay.paymentLink.create({
    amount: amount * 100,
    currency: 'INR',
    customer,
    notify: {
      sms: true,
      email: true
    }
  });
};

module.exports = {
  createPaymentLink
};
