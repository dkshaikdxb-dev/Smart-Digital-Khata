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
});

const idParamSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

const statusSchema = Joi.object({
  status: Joi.string()
    .valid('pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled')
    .required(),
});

router.use(auth(['owner', 'staff']));

router.get('/', validate(listQuerySchema, 'query'), asyncHandler(ctrl.list));
router.get('/:id', validate(idParamSchema, 'params'), asyncHandler(ctrl.get));
router.patch(
  '/:id/status',
  validate(idParamSchema, 'params'),
  validate(statusSchema),
  asyncHandler(ctrl.updateStatus)
);

module.exports = router;
