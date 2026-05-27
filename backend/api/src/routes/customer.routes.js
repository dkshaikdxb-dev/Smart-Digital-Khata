const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const customerController = require('../controllers/customer.controller');

router.get('/', authMiddleware, customerController.getCustomers);

router.post('/', authMiddleware, customerController.createCustomer);

module.exports = router;
