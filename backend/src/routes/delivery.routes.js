const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/delivery.controller');

// Delivery Champions (batch DELIV1). Two surfaces on one router:
//   1) Owner/staff management + assignment (JWT-authed, shop-scoped).
//   2) The champion's PUBLIC no-login token endpoints (/t/:token...), whose only
//      credential is the unguessable stored access_token — mounted BEFORE the
//      auth gate so they stay unauthenticated.

// 32-hex token, same shape as the customer khata share token.
const tokenParamSchema = Joi.object({
  token: Joi.string().pattern(/^[a-f0-9]{32}$/).required(),
});
const tokenStatusParamsSchema = Joi.object({
  token: Joi.string().pattern(/^[a-f0-9]{32}$/).required(),
  deliveryId: Joi.string().uuid().required(),
});
const tokenStatusBodySchema = Joi.object({
  status: Joi.string().valid('picked_up', 'delivered').required(),
});

// --- PUBLIC champion token endpoints (no auth) ---
router.get(
  '/t/:token',
  validate(tokenParamSchema, 'params'),
  asyncHandler(ctrl.tokenDeliveries)
);
router.post(
  '/t/:token/:deliveryId/status',
  validate(tokenStatusParamsSchema, 'params'),
  validate(tokenStatusBodySchema),
  asyncHandler(ctrl.tokenUpdateStatus)
);

// --- Owner/staff endpoints (JWT-authed, shop-scoped) ---
router.use(auth(['owner', 'staff']));

const createChampionSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120).required(),
  phone: Joi.string().trim().max(30).allow(null, ''),
  area: Joi.string().trim().max(200).allow(null, ''),
});
const updateChampionSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120),
  phone: Joi.string().trim().max(30).allow(null, ''),
  area: Joi.string().trim().max(200).allow(null, ''),
  is_active: Joi.boolean(),
}).min(1);
const idParamSchema = Joi.object({ id: Joi.string().uuid().required() });
const assignSchema = Joi.object({
  order_id: Joi.string().uuid().required(),
  champion_id: Joi.string().uuid().required(),
  fee_paise: Joi.number().integer().min(0),
});

router.get('/champions', asyncHandler(ctrl.listChampions));
router.post('/champions', validate(createChampionSchema), asyncHandler(ctrl.createChampion));
router.patch(
  '/champions/:id',
  validate(idParamSchema, 'params'),
  validate(updateChampionSchema),
  asyncHandler(ctrl.updateChampion)
);
router.post('/assign', validate(assignSchema), asyncHandler(ctrl.assign));
router.get('/orders', asyncHandler(ctrl.listDeliveryOrders));

module.exports = router;
