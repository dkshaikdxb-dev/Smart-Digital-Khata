const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const reportController = require('../controllers/report.controller');

router.get('/outstanding', authMiddleware, reportController.getOutstandingReport);

module.exports = router;
