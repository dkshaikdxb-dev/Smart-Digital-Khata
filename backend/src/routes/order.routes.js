const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/order.controller');

const listQuerySchema = Joi.object({
  status: Joi.string().valid(
    'pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'
  ),
  // Optional render language for customer_name_local (see utils/name-local);
  // unknown values are simply ignored by the controller.
  lang: Joi.string().max(16).allow(''),
});

const idParamSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

// ONE-TAP ACCEPT (batch B). `eta_minutes` is OPTIONAL and only meaningful on the
// move to 'accepted'; the controller answers 422 `eta_not_applicable` on any
// other target status rather than ignoring it. The 1..1440 band here is the HARD
// rail (0, a negative, a decimal or a word is a 400 from this validator); the
// live platform ceiling — order_eta_max_minutes, 240 by default — CLAMPS
// anything above it in the controller, so a stale client's larger chip is
// corrected rather than rejected mid-rush.
const ETA_MINUTES = Joi.number().integer().min(1).max(1440);

const statusSchema = Joi.object({
  status: Joi.string()
    .valid('pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled')
    .required(),
  eta_minutes: ETA_MINUTES,
});

// "Need more time" — re-promise an order that is already accepted.
const etaSchema = Joi.object({
  eta_minutes: ETA_MINUTES.required(),
});

// Repeating new-order alert (batch ORDERALERT).
const alertsQuerySchema = Joi.object({
  lang: Joi.string().max(16).allow(''),
});
// Mute window in minutes. 0 CLEARS the mute; 1..720 (12h) sets it. The
// controller clamps as well, so a value outside the band is corrected rather
// than rejected mid-rush — this schema only keeps nonsense out.
const muteSchema = Joi.object({
  minutes: Joi.number().integer().min(0).max(100000).required(),
});

router.use(auth(['owner', 'staff']));

router.get('/', validate(listQuerySchema, 'query'), asyncHandler(ctrl.list));
// NOTE: the two literal /alerts routes MUST be declared before '/:id', or the
// uuid param route would swallow them (and reject 'alerts' as a non-uuid).
router.get('/alerts', validate(alertsQuerySchema, 'query'), asyncHandler(ctrl.alerts));
router.post('/alerts/mute', validate(muteSchema), asyncHandler(ctrl.mute));
// Same rule as /alerts: a literal path must be declared before '/:id'.
router.get('/eta-config', asyncHandler(ctrl.etaConfig));
router.get('/:id', validate(idParamSchema, 'params'), asyncHandler(ctrl.get));
router.post('/:id/ack', validate(idParamSchema, 'params'), asyncHandler(ctrl.ack));
router.patch(
  '/:id/status',
  validate(idParamSchema, 'params'),
  validate(statusSchema),
  asyncHandler(ctrl.updateStatus)
);
router.patch(
  '/:id/eta',
  validate(idParamSchema, 'params'),
  validate(etaSchema),
  asyncHandler(ctrl.setEta)
);

module.exports = router;
