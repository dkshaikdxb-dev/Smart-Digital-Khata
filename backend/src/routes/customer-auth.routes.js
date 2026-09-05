const router = require('express').Router();
const Joi = require('joi');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const customerAuth = require('../middleware/customerAuth');
const ctrl = require('../controllers/customer-auth.controller');
const referralCtrl = require('../controllers/referral.controller');
const { makeCustomerAuthLimiter } = require('../config/authRateLimit');

// Consumer OTP-flooding guard, now env-tunable (AUTH_RATE_WINDOW_MS /
// AUTH_RATE_MAX) with defaults suited to shared/NAT'd village IPs — 20/min/IP,
// up from the old 5 — because many legitimate users share one public IP. Raising
// the per-IP cap is safe: the real brute-force defenses are per-ACCOUNT (OTP
// consumed + attempt cap; PIN account-lock) and are unchanged. See
// config/authRateLimit for the full rationale. Owner/admin login (auth.routes)
// keeps its own separate limiter and is untouched. Disabled under NODE_ENV=test.
const tightLimiter = makeCustomerAuthLimiter();

const phoneField = Joi.string().pattern(/^\+?[0-9]{10,15}$/).required();

const requestOtpSchema = Joi.object({
  phone: phoneField,
});

const verifyOtpSchema = Joi.object({
  phone: phoneField,
  code: Joi.string().pattern(/^[0-9]{6}$/).required(),
  // Optional onboarding-source attribution (Phase D). A missing/blank/invalid
  // code never blocks login; it is captured only when a NEW consumer is created.
  ref: Joi.string().max(64).allow('', null),
  source_channel: Joi.string().max(64).allow('', null),
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

// Number change (Phase G) — OTP-gated on the NEW number.
const changeNumberRequestSchema = Joi.object({ new_phone: phoneField });
const changeNumberVerifySchema = Joi.object({
  new_phone: phoneField,
  code: Joi.string().pattern(/^[0-9]{6}$/).required(),
});

// PIN (Phase G) — a 4–6 digit numeric PIN. A faster-than-OTP login that still
// needs data connectivity (NOT offline auth). current_pin is required only to
// change an existing PIN.
const pinField = Joi.string().pattern(/^[0-9]{4,6}$/);
const pinSetSchema = Joi.object({
  pin: pinField.required(),
  current_pin: pinField,
});
const pinLoginSchema = Joi.object({
  phone: phoneField,
  pin: pinField.required(),
});

router.post('/request-otp', tightLimiter, validate(requestOtpSchema), asyncHandler(ctrl.requestOtp));
router.post('/verify-otp', tightLimiter, validate(verifyOtpSchema), asyncHandler(ctrl.verifyOtp));
router.get('/me', customerAuth(), asyncHandler(ctrl.me));
router.patch('/profile', customerAuth(), validate(profileSchema), asyncHandler(ctrl.updateProfile));

// Self-service number change — both steps require the consumer to be logged in on
// the OLD number; the second step also proves control of the NEW number via OTP.
router.post('/change-number/request', customerAuth(), tightLimiter, validate(changeNumberRequestSchema), asyncHandler(ctrl.changeNumberRequest));
router.post('/change-number/verify', customerAuth(), tightLimiter, validate(changeNumberVerifySchema), asyncHandler(ctrl.changeNumberVerify));

// PIN management (authed) + PIN login (unauthed, per-IP rate-limited).
router.post('/pin/set', customerAuth(), validate(pinSetSchema), asyncHandler(ctrl.pinSet));
router.post('/pin/clear', customerAuth(), asyncHandler(ctrl.pinClear));
router.post('/pin/login', tightLimiter, validate(pinLoginSchema), asyncHandler(ctrl.pinLogin));

// Referrals (Phase D) — consumer equivalents of /api/me/referral.
router.get('/referral', customerAuth(), asyncHandler(referralCtrl.customerReferral));
router.get('/referral/chain', customerAuth(), asyncHandler(referralCtrl.customerReferralChain));

module.exports = router;
