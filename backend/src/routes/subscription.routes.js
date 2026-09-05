const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/subscription.controller');

const upgradeSchema = Joi.object({
  plan: Joi.string().valid('free', 'pro', 'family').required(),
});

// Read-only subscription views stay available to owner AND staff.
router.use(auth(['owner', 'staff']));
router.get('/plans', asyncHandler(ctrl.listPlans));
router.get('/me', asyncHandler(ctrl.getMine));
// Plan-changing (billing) routes are OWNER ONLY — staff must not change billing.
router.post('/upgrade', auth(['owner']), validate(upgradeSchema), asyncHandler(ctrl.upgrade));
router.post('/cancel', auth(['owner']), asyncHandler(ctrl.cancel));

module.exports = router;
