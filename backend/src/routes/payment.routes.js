const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/payment.controller');

const createOrderSchema = Joi.object({
  customer_id: Joi.string().uuid().required(),
  amount: Joi.number().integer().min(100).required(), // paise
  note: Joi.string().max(200).allow('', null),
});

router.use(auth());
router.post('/orders', validate(createOrderSchema), asyncHandler(ctrl.createOrder));
router.get('/orders/:id', asyncHandler(ctrl.getOrder));
router.post('/orders/:id/share', asyncHandler(ctrl.sharePaymentLink));

module.exports = router;
