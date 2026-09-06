const router = require('express').Router();
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/distributor.controller');

// Public distributor onboarding. Same anti-abuse guard as auth register.
const tightLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again in a minute' },
  skip: () => process.env.NODE_ENV === 'test',
});

const strArray = Joi.array().items(Joi.string().max(80)).max(50);

const registerSchema = Joi.object({
  business_name: Joi.string().min(2).max(120).required(),
  name: Joi.string().min(2).max(80).required(),
  email: Joi.string().email({ tlds: false }).allow('', null),
  phone: Joi.string().pattern(/^\+?[0-9]{10,15}$/).required(),
  password: Joi.string().min(8).max(128).required(),
  city: Joi.string().max(80).allow('', null),
  area: Joi.string().max(80).allow('', null),
  categories: strArray,
  brands: strArray,
  whatsapp: Joi.string().pattern(/^\+?[0-9]{10,15}$/).allow('', null),
  kind: Joi.string().valid('distributor', 'farmer'),
  village: Joi.string().max(120).allow('', null),
});

router.post('/register', tightLimiter, validate(registerSchema), asyncHandler(ctrl.register));

module.exports = router;
