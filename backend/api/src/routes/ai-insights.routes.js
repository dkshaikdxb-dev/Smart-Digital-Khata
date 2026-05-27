const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const aiInsightsController = require('../controllers/ai-insights.controller');

router.post('/', authMiddleware, aiInsightsController.getInsights);

module.exports = router;
