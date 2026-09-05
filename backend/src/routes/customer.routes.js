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
  notifications_enabled: Joi.boolean(),
});

// Merge-aware number change (Phase G). merge:true opts in to combining ledgers
// when the new number already belongs to another customer in this shop.
const changePhoneSchema = Joi.object({
  phone: Joi.string().pattern(/^\+?[0-9]{10,15}$/).required(),
  merge: Joi.boolean().default(false),
});

const shareSchema = Joi.object({
  send: Joi.boolean().default(false),
  regenerate: Joi.boolean().default(false),
});

const statementQuerySchema = Joi.object({
  from: Joi.date().iso(),
  to: Joi.date().iso(),
  format: Joi.string().valid('json', 'csv').default('json'),
});

router.use(auth(['owner', 'staff']));
router.get('/', asyncHandler(ctrl.list));
router.post('/', validate(createSchema), asyncHandler(ctrl.create));
router.get('/:id', asyncHandler(ctrl.get));
router.patch('/:id', validate(updateSchema), asyncHandler(ctrl.update));
router.post('/:id/change-phone', validate(changePhoneSchema), asyncHandler(ctrl.changePhone));
router.get('/:id/ledger', asyncHandler(ctrl.ledger));
router.get('/:id/statement', validate(statementQuerySchema, 'query'), asyncHandler(ctrl.statement));
router.post('/:id/share-link', validate(shareSchema), asyncHandler(ctrl.shareLink));

module.exports = router;
