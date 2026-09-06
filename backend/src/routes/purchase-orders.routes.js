const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/distributor.controller');

const PO_STATUSES = ['placed', 'confirmed', 'dispatched', 'delivered', 'cancelled'];

const listQuerySchema = Joi.object({ status: Joi.string().valid(...PO_STATUSES) });
const idParamSchema = Joi.object({ id: Joi.string().uuid().required() });

const createSchema = Joi.object({
  distributor_id: Joi.string().uuid().required(),
  note: Joi.string().max(500).allow('', null),
  items: Joi.array().items(
    Joi.object({
      catalog_item_id: Joi.string().uuid().allow(null),
      name: Joi.string().min(1).max(200).required(),
      brand: Joi.string().max(120).allow('', null),
      pack: Joi.string().max(80).allow('', null),
      unit: Joi.string().max(40).allow('', null),
      qty: Joi.number().integer().min(1).required(),
    })
  ).min(1).max(200).required(),
});

// Owner/staff purchase orders, scoped to req.user.shopId.
router.use(auth(['owner', 'staff']));

router.post('/', validate(createSchema), asyncHandler(ctrl.createPO));
router.get('/', validate(listQuerySchema, 'query'), asyncHandler(ctrl.listPOs));
router.get('/:id', validate(idParamSchema, 'params'), asyncHandler(ctrl.getPO));
router.post('/:id/cancel', validate(idParamSchema, 'params'), asyncHandler(ctrl.cancelPO));

module.exports = router;
