const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/staff.controller');

const phoneField = Joi.string().pattern(/^\+?[0-9]{10,15}$/);
// tlds:false — match the register/login email handling (joi 18 rejects some
// valid new-gTLD / .local dev addresses otherwise).
const emailField = Joi.string().email({ tlds: false });

const createSchema = Joi.object({
  name: Joi.string().min(2).max(80).required(),
  phone: phoneField.required(),
  password: Joi.string().min(6).max(128).required(),
  email: emailField.allow('', null),
});

const updateSchema = Joi.object({
  name: Joi.string().min(2).max(80),
  password: Joi.string().min(6).max(128),
  is_active: Joi.boolean(),
}).min(1);

// OWNER ONLY — staff cannot manage staff. All handlers scope to req.user.shopId.
router.use(auth(['owner']));
router.get('/', asyncHandler(ctrl.list));
router.post('/', validate(createSchema), asyncHandler(ctrl.create));
router.patch('/:id', validate(updateSchema), asyncHandler(ctrl.update));
router.delete('/:id', asyncHandler(ctrl.remove));

module.exports = router;
