const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const smartNudgeController = require('../controllers/smart-nudge.controller');

router.post('/', authMiddleware, smartNudgeController.generateNudge);

module.exports = router;
