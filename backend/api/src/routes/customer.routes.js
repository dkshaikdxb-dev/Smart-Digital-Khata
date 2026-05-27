const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const customerController = require('../controllers/customer.controller');
const { validateCustomerPayload } = require('../validators/customer.validator');

router.get('/', authMiddleware, customerController.getCustomers);

router.post(
  '/',
  authMiddleware,
  validateCustomerPayload,
  customerController.createCustomer
);

module.exports = router;
