const router = require('express').Router();
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const customerAuth = require('../middleware/customerAuth');
const ctrl = require('../controllers/customer-auth.controller');

// OTP-flooding guard: 5 requests / minute / IP (mirrors auth.routes).
const tightLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again in a minute' },
});

const phoneField = Joi.string().pattern(/^\+?[0-9]{10,15}$/).required();

const requestOtpSchema = Joi.object({
  phone: phoneField,
});

const verifyOtpSchema = Joi.object({
  phone: phoneField,
  code: Joi.string().pattern(/^[0-9]{6}$/).required(),
});

router.post('/request-otp', tightLimiter, validate(requestOtpSchema), asyncHandler(ctrl.requestOtp));
router.post('/verify-otp', tightLimiter, validate(verifyOtpSchema), asyncHandler(ctrl.verifyOtp));
router.get('/me', customerAuth(), asyncHandler(ctrl.me));

module.exports = router;
