const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/promos.controller');

// Owner self-serve promo placement (batch PROMO-BUY). A shop OWNER spends its
// earned Khata Credits to buy a moderated promo advertising its own store. Every
// endpoint is scoped to the authenticated owner's shop (req.user.shopId); staff
// are intentionally excluded — buying a paid placement is an owner decision.
router.use(auth(['owner']));

// GET /api/promos/config → { enabled, credits_per_day_paise, max_days, balance_paise }
router.get('/config', asyncHandler(ctrl.mineConfig));

// The upper bound (days) is clamped again against the LIVE max_days in the
// controller; this Joi cap is a coarse guard so an absurd value never reaches it.
const createSchema = Joi.object({
  // 'paid' (default) spends Khata Credits; 'free' asks for a no-cost, admin-
  // approved, throttled placement (the wallet is never touched). The controller
  // branches on this — the paid path is unchanged.
  mode: Joi.string().valid('paid', 'free').default('paid'),
  days: Joi.number().integer().min(1).max(365).required(),
  offer_text: Joi.string().trim().allow('', null).max(60),
  subtitle: Joi.string().trim().allow('', null).max(80),
});

// POST /api/promos/mine → buy a placement (debits credits, starts pending_review)
router.post('/mine', validate(createSchema), asyncHandler(ctrl.mineCreate));

// GET /api/promos/mine → this shop's own placements, newest first
router.get('/mine', asyncHandler(ctrl.mineList));

module.exports = router;
