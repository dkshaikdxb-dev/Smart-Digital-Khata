const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const authorize = require('../middleware/rbac.middleware');
const whatsappController = require('../controllers/whatsapp.controller');

router.post(
  '/send-reminder',
  authMiddleware,
  authorize('manage_ledger'),
  whatsappController.sendReminder
);

module.exports = router;
