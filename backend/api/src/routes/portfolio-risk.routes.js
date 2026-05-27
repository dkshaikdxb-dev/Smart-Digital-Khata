const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const portfolioRiskController = require('../controllers/portfolio-risk.controller');

router.post('/', authMiddleware, portfolioRiskController.getPortfolioRisk);

module.exports = router;
