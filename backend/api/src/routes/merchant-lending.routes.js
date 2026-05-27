const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const merchantLendingController = require('../controllers/merchant-lending.controller');

router.post('/', authMiddleware, merchantLendingController.getMerchantLoanEligibility);

module.exports = router;
