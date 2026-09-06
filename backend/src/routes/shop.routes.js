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
  // Owner Help "lane B": weekly WhatsApp summary opt-in (Batch J).
  weekly_summary: Joi.boolean(),
  // Shop Discovery (M6): public directory opt-in + location. null clears a
  // field so an owner can wipe their location / opt out of the geo directory.
  city: Joi.string().allow('', null).max(120),
  area: Joi.string().allow('', null).max(120),
  latitude: Joi.number().min(-90).max(90).allow(null),
  longitude: Joi.number().min(-180).max(180).allow(null),
  is_listed: Joi.boolean(),
  // Fulfillment (M7): pickup/delivery availability, flat delivery fee, an
  // optional free-delivery threshold, a delivery minimum-order gate, plus
  // informational radius/hours. All money is integer paise. null clears the
  // nullable fields (free_delivery_min, radius, hours).
  offers_pickup: Joi.boolean(),
  offers_delivery: Joi.boolean(),
  delivery_fee: Joi.number().integer().min(0),
  free_delivery_min: Joi.number().integer().min(0).allow(null),
  delivery_min_order: Joi.number().integer().min(0),
  delivery_radius_km: Joi.number().min(0).max(100).allow(null),
  delivery_hours: Joi.string().allow('', null).max(120),
});

router.use(auth(['owner', 'staff']));
router.get('/me', asyncHandler(ctrl.getMine));
router.patch('/me', validate(updateSchema), asyncHandler(ctrl.updateMine));

module.exports = router;
