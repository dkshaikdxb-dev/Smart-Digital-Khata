const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const defaulterForecastController = require('../controllers/defaulter-forecast.controller');

router.post('/', authMiddleware, defaulterForecastController.getDefaulterForecast);

module.exports = router;
