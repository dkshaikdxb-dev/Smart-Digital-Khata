const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const authorize = require('../middleware/rbac.middleware');
const paymentController = require('../controllers/payment.controller');
const razorpayService = require('../services/razorpay.service');

router.post(
  '/link',
  authMiddleware,
  authorize('manage_ledger'),
  paymentController.generatePaymentLink
);

router.post('/payment-link', async (req, res) => {
  const paymentLink = await razorpayService.createPaymentLink(req.body);

  return res.status(200).json({
    success: true,
    data: paymentLink
  });
});

router.get(
  '/',
  authMiddleware,
  authorize('view_reports'),
  paymentController.getPayments
);

module.exports = router;
