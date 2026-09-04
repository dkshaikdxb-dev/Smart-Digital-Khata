const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/shop.controller');

const updateSchema = Joi.object({
  name: Joi.string().min(2).max(120),
  notification_mode: Joi.string().valid('silent', 'smart', 'active'),
  default_credit_limit: Joi.number().min(0),
  daily_digest: Joi.boolean(),
});

router.use(auth(['owner', 'staff']));
router.get('/me', asyncHandler(ctrl.getMine));
router.patch('/me', validate(updateSchema), asyncHandler(ctrl.updateMine));

module.exports = router;
