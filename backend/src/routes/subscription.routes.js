const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/subscription.controller');

const upgradeSchema = Joi.object({
  plan: Joi.string().valid('free', 'pro', 'family').required(),
});

router.use(auth());
router.get('/plans', asyncHandler(ctrl.listPlans));
router.get('/me', asyncHandler(ctrl.getMine));
router.post('/upgrade', validate(upgradeSchema), asyncHandler(ctrl.upgrade));
router.post('/cancel', asyncHandler(ctrl.cancel));

module.exports = router;
