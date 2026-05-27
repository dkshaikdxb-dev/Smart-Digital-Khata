const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const merchantHealthController = require('../controllers/merchant-health.controller');

router.post('/', authMiddleware, merchantHealthController.getMerchantHealth);

module.exports = router;
