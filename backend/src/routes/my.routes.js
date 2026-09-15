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
  // Optional client-generated id for idempotent retries from offline/2G clients.
  // Same shape and the same promise as transactions.client_request_id
  // (routes/transaction.routes.js) and order_edits.client_request_id
  // (routes/order.routes.js): send the same id again and you get the SAME order
  // back, never a second one and never a second khata debit.
  client_request_id: Joi.string().uuid().optional(),
});

const orderIdSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

// Consumer location (LOC1). Each field optional; town/village trimmed + capped;
// pincode is 4–6 digits or empty. '' / null clears a field.
const locationSchema = Joi.object({
  town: Joi.string().trim().allow('', null).max(120),
  village: Joi.string().trim().allow('', null).max(120),
  pincode: Joi.string().pattern(/^[0-9]{4,6}$/).allow('', null),
}).messages({
  'string.pattern.base': 'Pincode must be 4 to 6 digits',
});

// Consumer language (batch LANG). The shopper's pick on the consumer PWA, kept
// server-side so the WhatsApp messages this app sends them are in it. Joi checks
// only the SHAPE; the controller refuses a code that is not in the `languages`
// registry. '' / null clears it back to "never told us".
const languageSchema = Joi.object({
  language: Joi.string().trim().lowercase().pattern(/^[a-z]{2,8}$/).allow('', null).required(),
}).messages({
  'string.pattern.base': 'Language must be a short language code, e.g. "mr"',
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

router.get('/location', asyncHandler(ctrl.getLocation));
router.put('/location', validate(locationSchema), asyncHandler(ctrl.putLocation));

router.get('/language', asyncHandler(ctrl.getLanguage));
router.put('/language', validate(languageSchema), asyncHandler(ctrl.putLanguage));

router.get('/khata', asyncHandler(ctrl.khata));
router.get('/shop-faqs', asyncHandler(ctrl.shopFaqs));
router.get('/statement', validate(statementQuerySchema, 'query'), asyncHandler(ctrl.statement));
router.get('/khata/:shopId', validate(shopParamSchema, 'params'), asyncHandler(ctrl.shopKhata));
router.post('/pay', validate(paySchema), asyncHandler(ctrl.pay));

const ordersCsvQuerySchema = Joi.object({
  shop_id: Joi.string().uuid(),
});

// "Buy it again" — the shopper's own previously ordered items, most frequent
// first. Scoped by customerAuth() above like everything else under /my.
const buyAgainQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(20),
});
router.get('/buy-again', validate(buyAgainQuerySchema, 'query'), asyncHandler(ctrl.buyAgain));

router.post('/orders', validate(createOrderSchema), asyncHandler(ctrl.createOrder));
router.get('/orders.csv', validate(ordersCsvQuerySchema, 'query'), asyncHandler(ctrl.ordersCsv));
router.get('/orders', asyncHandler(ctrl.listOrders));
router.get('/orders/:id', validate(orderIdSchema, 'params'), asyncHandler(ctrl.getOrder));
router.post('/orders/:id/cancel', validate(orderIdSchema, 'params'), asyncHandler(ctrl.cancelOrder));

module.exports = router;
