const express = require('express');
const router = express.Router();

const subscriptionController = require('../controllers/subscription.controller');

router.get('/plans', subscriptionController.getPlans);

module.exports = router;
