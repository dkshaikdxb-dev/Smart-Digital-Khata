const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const recoveryPredictionController = require('../controllers/recovery-prediction.controller');

router.post(
  '/',
  authMiddleware,
  recoveryPredictionController.getRecoveryPrediction
);

module.exports = router;
