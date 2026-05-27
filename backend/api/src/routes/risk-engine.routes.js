const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const riskEngineController = require('../controllers/risk-engine.controller');

router.post('/', authMiddleware, riskEngineController.getRiskScore);

module.exports = router;
