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

// Consumer profile edit. phone is the login id and is intentionally NOT here.
// All fields optional/privacy-first; gender is one of four values or null and a
// date_of_birth may never be in the future.
const GENDERS = ['male', 'female', 'other', 'prefer_not_to_say'];
const profileSchema = Joi.object({
  name: Joi.string().min(1).max(120).allow('', null),
  email: Joi.string().email({ tlds: false }).allow('', null),
  gender: Joi.string().valid(...GENDERS).allow(null),
  date_of_birth: Joi.date().max('now').allow(null),
}).min(1);

router.post('/request-otp', tightLimiter, validate(requestOtpSchema), asyncHandler(ctrl.requestOtp));
router.post('/verify-otp', tightLimiter, validate(verifyOtpSchema), asyncHandler(ctrl.verifyOtp));
router.get('/me', customerAuth(), asyncHandler(ctrl.me));
router.patch('/profile', customerAuth(), validate(profileSchema), asyncHandler(ctrl.updateProfile));

module.exports = router;
