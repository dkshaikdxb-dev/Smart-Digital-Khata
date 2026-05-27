const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const cashflowController = require('../controllers/cashflow-intelligence.controller');

router.post('/', authMiddleware, cashflowController.getCashflowInsights);

module.exports = router;
