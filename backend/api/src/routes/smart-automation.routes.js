const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const smartAutomationController = require('../controllers/smart-automation.controller');

router.post('/', authMiddleware, smartAutomationController.getAutomationWorkflow);

module.exports = router;
