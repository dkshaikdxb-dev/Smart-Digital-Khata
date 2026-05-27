const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const authorize = require('../middleware/rbac.middleware');
const paymentController = require('../controllers/payment.controller');

router.post(
  '/link',
  authMiddleware,
  authorize('manage_ledger'),
  paymentController.generatePaymentLink
);

router.get(
  '/',
  authMiddleware,
  authorize('view_reports'),
  paymentController.getPayments
);

module.exports = router;
