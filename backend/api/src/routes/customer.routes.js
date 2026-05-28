const express = require('express');
const router = express.Router();

const prisma = require('../lib/prisma');
const authMiddleware = require('../middleware/auth.middleware');
const customerController = require('../controllers/customer.controller');
const { validateCustomerPayload } = require('../validators/customer.validator');

router.get('/', authMiddleware, async (req, res) => {
  const customers = await prisma.customer.findMany({
    orderBy: {
      createdAt: 'desc'
    }
  });

  return res.status(200).json({
    success: true,
    data: customers
  });
});

router.post(
  '/',
  authMiddleware,
  validateCustomerPayload,
  customerController.createCustomer
);

module.exports = router;
