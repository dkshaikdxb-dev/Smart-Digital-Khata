const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const revenueForecastController = require('../controllers/revenue-forecast.controller');

router.post('/', authMiddleware, revenueForecastController.getRevenueForecast);

module.exports = router;
