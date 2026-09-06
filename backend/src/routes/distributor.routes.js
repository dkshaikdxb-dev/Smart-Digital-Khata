const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/distributor.controller');

const strArray = Joi.array().items(Joi.string().max(80)).max(50);
const PO_STATUSES = ['placed', 'confirmed', 'dispatched', 'delivered', 'cancelled'];

const profileSchema = Joi.object({
  business_name: Joi.string().min(2).max(120),
  city: Joi.string().max(80).allow('', null),
  area: Joi.string().max(80).allow('', null),
  categories: strArray,
  brands: strArray,
  whatsapp: Joi.string().pattern(/^\+?[0-9]{10,15}$/).allow('', null),
  min_order_paise: Joi.number().integer().min(0),
  is_active: Joi.boolean(),
  village: Joi.string().max(120).allow('', null),
  kind: Joi.string().valid('distributor', 'farmer'),
}).min(1);

const listQuerySchema = Joi.object({ status: Joi.string().valid(...PO_STATUSES) });
const idParamSchema = Joi.object({ id: Joi.string().uuid().required() });
const shopIdParamSchema = Joi.object({ shopId: Joi.string().uuid().required() });

const patchOrderSchema = Joi.object({
  status: Joi.string().valid(...PO_STATUSES),
  items: Joi.array().items(
    Joi.object({
      id: Joi.string().uuid().required(),
      unit_price_paise: Joi.number().integer().min(0).required(),
    })
  ).max(200),
}).min(1);

const paymentSchema = Joi.object({
  amount_paise: Joi.number().integer().min(1).required(),
  method: Joi.string().max(40).allow('', null),
  note: Joi.string().max(500).allow('', null),
});

router.use(auth(['distributor']));

router.get('/me', asyncHandler(ctrl.getMe));
router.patch('/me', validate(profileSchema), asyncHandler(ctrl.patchMe));

router.get('/orders', validate(listQuerySchema, 'query'), asyncHandler(ctrl.listOrders));
router.get('/orders/:id', validate(idParamSchema, 'params'), asyncHandler(ctrl.getOrder));
router.patch(
  '/orders/:id',
  validate(idParamSchema, 'params'),
  validate(patchOrderSchema),
  asyncHandler(ctrl.patchOrder)
);

router.get('/shops', asyncHandler(ctrl.listDistShops));
router.post(
  '/shops/:shopId/payment',
  validate(shopIdParamSchema, 'params'),
  validate(paymentSchema),
  asyncHandler(ctrl.recordPayment)
);

module.exports = router;
