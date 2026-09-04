const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/family.controller');

const uuid = Joi.string().uuid();

const createSchema = Joi.object({
  name: Joi.string().min(2).max(120).required(),
  credit_limit: Joi.number().integer().min(0).default(0),
  payer_customer_id: uuid.allow(null),
  member_ids: Joi.array().items(uuid).default([]),
});

const updateSchema = Joi.object({
  name: Joi.string().min(2).max(120),
  credit_limit: Joi.number().integer().min(0),
  payer_customer_id: uuid.allow(null),
}).min(1);

const addMemberSchema = Joi.object({
  customer_id: uuid.required(),
  sub_limit: Joi.number().integer().min(0).allow(null),
});

router.use(auth(['owner', 'staff']));
router.get('/', asyncHandler(ctrl.list));
router.post('/', validate(createSchema), asyncHandler(ctrl.create));
router.get('/:id', asyncHandler(ctrl.get));
router.patch('/:id', validate(updateSchema), asyncHandler(ctrl.update));
router.post('/:id/members', validate(addMemberSchema), asyncHandler(ctrl.addMember));
router.delete('/:id/members/:customerId', asyncHandler(ctrl.removeMember));
router.get('/:id/statement', asyncHandler(ctrl.statement));
router.post('/:id/remind', asyncHandler(ctrl.remind));

module.exports = router;
