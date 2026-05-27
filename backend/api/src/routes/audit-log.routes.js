const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const authorize = require('../middleware/rbac.middleware');
const auditLogController = require('../controllers/audit-log.controller');

router.get(
  '/',
  authMiddleware,
  authorize('manage_staff'),
  auditLogController.getAuditLogs
);

module.exports = router;
