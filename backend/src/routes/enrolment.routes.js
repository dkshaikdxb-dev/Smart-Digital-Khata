const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/enrolment.controller');

// Body for POST /order — the tier the shop is enrolling into.
const orderSchema = Joi.object({
  tier: Joi.string().valid('basic', 'premium').required(),
});

// Body for POST /confirm — either the Razorpay checkout triple, or the manual
// enrolment id (dev/unconfigured). The controller enforces which one applies.
const confirmSchema = Joi.object({
  order_id: Joi.string(),
  payment_id: Joi.string(),
  signature: Joi.string(),
  enrolment_id: Joi.string().uuid(),
}).or('order_id', 'enrolment_id');

// Read-only views stay available to owner AND staff.
router.use(auth(['owner', 'staff']));
router.get('/config', asyncHandler(ctrl.getConfig));
router.get('/mine', asyncHandler(ctrl.getMine));

// Money-moving routes are OWNER ONLY — staff must not drive enrolment billing.
router.post('/order', auth(['owner']), validate(orderSchema), asyncHandler(ctrl.createOrder));
router.post('/confirm', auth(['owner']), validate(confirmSchema), asyncHandler(ctrl.confirm));

module.exports = router;
