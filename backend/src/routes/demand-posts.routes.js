const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/demand.controller');

const POST_STATUSES = ['open', 'claimed', 'cancelled'];

const listQuerySchema = Joi.object({ status: Joi.string().valid(...POST_STATUSES) });
const idParamSchema = Joi.object({ id: Joi.string().uuid().required() });

const createSchema = Joi.object({
  needed_by: Joi.date().iso().allow(null),
  note: Joi.string().max(500).allow('', null),
  items: Joi.array().items(
    Joi.object({
      name: Joi.string().min(1).max(200).required(),
      brand: Joi.string().max(120).allow('', null),
      pack: Joi.string().max(80).allow('', null),
      unit: Joi.string().max(40).allow('', null),
      qty: Joi.number().integer().min(1).required(),
    })
  ).min(1).max(100).required(),
});

// Owner/staff demand board, scoped to req.user.shopId.
router.use(auth(['owner', 'staff']));

router.post('/', validate(createSchema), asyncHandler(ctrl.createPost));
router.get('/', validate(listQuerySchema, 'query'), asyncHandler(ctrl.listPosts));
router.get('/:id', validate(idParamSchema, 'params'), asyncHandler(ctrl.getPost));
router.post('/:id/cancel', validate(idParamSchema, 'params'), asyncHandler(ctrl.cancelPost));

module.exports = router;
