const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const notificationController = require('../controllers/notification.controller');

router.post('/send', authMiddleware, notificationController.sendReminder);

router.get('/logs', authMiddleware, notificationController.getLogs);

module.exports = router;
