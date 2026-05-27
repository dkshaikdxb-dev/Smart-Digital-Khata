const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const merchantCopilotController = require('../controllers/merchant-ai-copilot.controller');

router.post('/', authMiddleware, merchantCopilotController.getMerchantCopilotAdvice);

module.exports = router;
