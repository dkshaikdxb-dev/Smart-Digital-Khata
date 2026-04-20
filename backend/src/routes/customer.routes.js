const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/customer.controller');

const createSchema = Joi.object({
  name: Joi.string().min(2).max(120).required(),
  phone: Joi.string().pattern(/^\+?[0-9]{10,15}$/).required(),
  credit_limit: Joi.number().min(0).default(0),
  notes: Joi.string().allow('', null),
});

const updateSchema = Joi.object({
  name: Joi.string().min(2).max(120),
  phone: Joi.string().pattern(/^\+?[0-9]{10,15}$/),
  credit_limit: Joi.number().min(0),
  notes: Joi.string().allow('', null),
  status: Joi.string().valid('active', 'archived'),
});

router.use(auth());
router.get('/', asyncHandler(ctrl.list));
router.post('/', validate(createSchema), asyncHandler(ctrl.create));
router.get('/:id', asyncHandler(ctrl.get));
router.patch('/:id', validate(updateSchema), asyncHandler(ctrl.update));
router.get('/:id/ledger', asyncHandler(ctrl.ledger));

module.exports = router;
