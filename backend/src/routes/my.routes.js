const router = require('express').Router();
const Joi = require('joi');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const customerAuth = require('../middleware/customerAuth');
const ctrl = require('../controllers/my.controller');

const shopParamSchema = Joi.object({
  shopId: Joi.string().uuid().required(),
});

const paySchema = Joi.object({
  shop_id: Joi.string().uuid().required(),
  amount: Joi.number().integer().min(1).required(), // paise
});

const createOrderSchema = Joi.object({
  shop_id: Joi.string().uuid().required(),
  items: Joi.array()
    .items(
      // A line is either a unit line (quantity) or a weighed line (weight_grams,
      // grams). At least one must be present; the server recomputes the price and
      // decides which applies from the product's sold_by_weight flag.
      Joi.object({
        product_id: Joi.string().uuid().required(),
        quantity: Joi.number().integer().min(1),
        weight_grams: Joi.number().integer().min(1).max(100000),
      }).or('quantity', 'weight_grams')
    )
    .required(),
  fulfillment_type: Joi.string().valid('delivery', 'pickup').required(),
  payment_mode: Joi.string().valid('credit', 'prepaid', 'cash').required(),
  address: Joi.string().allow('', null),
  note: Joi.string().allow('', null),
});

const orderIdSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

// Statement range/format. shop_id optional (omitted → all-shops combined).
const statementQuerySchema = Joi.object({
  shop_id: Joi.string().uuid(),
  from: Joi.date().iso(),
  to: Joi.date().iso(),
  format: Joi.string().valid('json', 'csv').default('json'),
});

// Every /my endpoint is scoped to the authenticated customer's phone.
router.use(customerAuth());

router.get('/khata', asyncHandler(ctrl.khata));
router.get('/statement', validate(statementQuerySchema, 'query'), asyncHandler(ctrl.statement));
router.get('/khata/:shopId', validate(shopParamSchema, 'params'), asyncHandler(ctrl.shopKhata));
router.post('/pay', validate(paySchema), asyncHandler(ctrl.pay));

router.post('/orders', validate(createOrderSchema), asyncHandler(ctrl.createOrder));
router.get('/orders', asyncHandler(ctrl.listOrders));
router.get('/orders/:id', validate(orderIdSchema, 'params'), asyncHandler(ctrl.getOrder));
router.post('/orders/:id/cancel', validate(orderIdSchema, 'params'), asyncHandler(ctrl.cancelOrder));

module.exports = router;
