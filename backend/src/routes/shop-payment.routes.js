const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/shop-payment.controller');

// Owner/staff-scoped: each shop manages its OWN Razorpay connection here.
const updateSchema = Joi.object({
  razorpay_key_id: Joi.string().max(120).allow('', null),
  razorpay_key_secret: Joi.string().max(200).allow('', null),
  razorpay_webhook_secret: Joi.string().max(200).allow('', null),
});

router.use(auth(['owner', 'staff']));
router.get('/me/payment', asyncHandler(ctrl.get));
router.patch('/me/payment', validate(updateSchema), asyncHandler(ctrl.update));
router.post('/me/payment/test', asyncHandler(ctrl.test));

module.exports = router;
