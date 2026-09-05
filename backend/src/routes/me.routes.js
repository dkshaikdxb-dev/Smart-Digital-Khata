const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/me.controller');

// Shared field rules. All PII is OPTIONAL: gender is one of four values or null,
// date_of_birth is null or a real past date (future dates rejected), email is a
// valid address when present. role/shop_id/password are never accepted here.
const GENDERS = ['male', 'female', 'other', 'prefer_not_to_say'];

const updateSchema = Joi.object({
  name: Joi.string().min(2).max(120),
  email: Joi.string().email({ tlds: false }).allow('', null),
  phone: Joi.string().pattern(/^\+?[0-9]{10,15}$/),
  gender: Joi.string().valid(...GENDERS).allow(null),
  date_of_birth: Joi.date().max('now').allow(null),
}).min(1);

// Personal account for the signed-in owner/staff/admin.
router.use(auth(['owner', 'staff', 'admin']));
router.get('/profile', asyncHandler(ctrl.getProfile));
router.patch('/profile', validate(updateSchema), asyncHandler(ctrl.updateProfile));

module.exports = router;
