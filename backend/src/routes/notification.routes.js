const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/notification.controller');

router.use(auth(['owner', 'staff']));

router.post(
  '/remind/:customerId',
  asyncHandler(ctrl.remindCustomer)
);

router.post(
  '/broadcast',
  validate(
    Joi.object({
      mode: Joi.string().valid('outstanding', 'all').default('outstanding'),
    })
  ),
  asyncHandler(ctrl.broadcast)
);

module.exports = router;
