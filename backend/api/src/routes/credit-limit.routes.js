const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const creditLimitController = require('../controllers/credit-limit.controller');

router.post('/', authMiddleware, creditLimitController.getCreditLimitRecommendation);

module.exports = router;
