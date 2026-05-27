const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const complianceController = require('../controllers/compliance-monitor.controller');

router.post('/', authMiddleware, complianceController.getComplianceStatus);

module.exports = router;
