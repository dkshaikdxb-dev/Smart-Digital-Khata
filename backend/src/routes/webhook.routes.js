const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/webhook.controller');

// NOTE: raw body parser is registered for /api/webhooks in app.js (covers the
// /razorpay/shop/:token subpath too).
router.post('/razorpay', asyncHandler(ctrl.razorpay));
router.post('/razorpay/shop/:token', asyncHandler(ctrl.razorpayShop));
router.get('/whatsapp', ctrl.whatsappVerify);
router.post('/whatsapp', asyncHandler(ctrl.whatsappInbound));

module.exports = router;
