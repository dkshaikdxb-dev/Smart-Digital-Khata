const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/transaction.controller');

const createSchema = Joi.object({
  customer_id: Joi.string().uuid().required(),
  type: Joi.string().valid('purchase', 'cash', 'upi').required(),
  amount: Joi.number().positive().required(),
  method: Joi.string().valid('cash', 'upi', 'credit', 'razorpay').default('credit'),
  note: Joi.string().max(500).allow('', null),
});

router.use(auth());
router.get('/', asyncHandler(ctrl.list));
router.post('/', validate(createSchema), asyncHandler(ctrl.create));
router.get('/:id', asyncHandler(ctrl.get));

module.exports = router;
