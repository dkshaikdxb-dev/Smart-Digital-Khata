const router = require('express').Router();
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/auth.controller');

// Credential-stuffing guard: 5 attempts / minute / IP
const tightLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again in a minute' },
});

const registerSchema = Joi.object({
  name: Joi.string().min(2).max(80).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().pattern(/^\+?[0-9]{10,15}$/).required(),
  password: Joi.string().min(8).max(128).required(),
  shopName: Joi.string().min(2).max(120).required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

router.post('/register', tightLimiter, validate(registerSchema), asyncHandler(ctrl.register));
router.post('/login', tightLimiter, validate(loginSchema), asyncHandler(ctrl.login));
router.get('/me', require('../middleware/auth')(), asyncHandler(ctrl.me));

module.exports = router;
