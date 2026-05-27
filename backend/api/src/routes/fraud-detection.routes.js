const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const fraudDetectionController = require('../controllers/fraud-detection.controller');

router.post('/', authMiddleware, fraudDetectionController.getFraudRisk);

module.exports = router;
