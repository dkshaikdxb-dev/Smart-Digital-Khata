const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const escalationEngineController = require('../controllers/escalation-engine.controller');

router.post(
  '/',
  authMiddleware,
  escalationEngineController.getEscalationDecision
);

module.exports = router;
