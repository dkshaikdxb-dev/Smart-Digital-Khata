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

// Every /my endpoint is scoped to the authenticated customer's phone.
router.use(customerAuth());

router.get('/khata', asyncHandler(ctrl.khata));
router.get('/khata/:shopId', validate(shopParamSchema, 'params'), asyncHandler(ctrl.shopKhata));
router.post('/pay', validate(paySchema), asyncHandler(ctrl.pay));

module.exports = router;
