const router = require('express').Router();
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/auth.controller');

// Credential-stuffing guard: 5 attempts / minute / IP. Disabled under the test
// runner (NODE_ENV=test), where many rapid logins from one IP are expected;
// production behaviour is unchanged.
const tightLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again in a minute' },
  skip: () => process.env.NODE_ENV === 'test',
});

// tlds:false — joi 18 otherwise rejects valid emails on TLDs missing from
// its bundled IANA list (new gTLDs, .test/.local in dev)
const emailField = Joi.string().email({ tlds: false }).required();

const registerSchema = Joi.object({
  name: Joi.string().min(2).max(80).required(),
  email: emailField,
  phone: Joi.string().pattern(/^\+?[0-9]{10,15}$/).required(),
  password: Joi.string().min(8).max(128).required(),
  shopName: Joi.string().min(2).max(120).required(),
});

// The login identifier arrives in the `email` field but may be an email
// (owner/admin) OR a phone number (staff created by phone). Accept either shape
// so phone logins are not rejected before the controller can resolve them.
const loginIdentifier = Joi.alternatives()
  .try(
    Joi.string().email({ tlds: false }),
    Joi.string().pattern(/^\+?[0-9]{10,15}$/)
  )
  .required()
  .messages({ 'alternatives.match': '"email" must be a valid email or phone number' });

const loginSchema = Joi.object({
  email: loginIdentifier,
  password: Joi.string().required(),
});

router.post('/register', tightLimiter, validate(registerSchema), asyncHandler(ctrl.register));
router.post('/login', tightLimiter, validate(loginSchema), asyncHandler(ctrl.login));
router.get('/me', require('../middleware/auth')(), asyncHandler(ctrl.me));

module.exports = router;
