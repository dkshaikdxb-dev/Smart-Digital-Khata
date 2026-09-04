const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/product.controller');

const createSchema = Joi.object({
  name: Joi.string().min(1).max(200).required(),
  price: Joi.number().integer().min(0).default(0), // paise
  description: Joi.string().allow('', null),
  unit: Joi.string().min(1).max(40),
  image_url: Joi.string().uri().allow('', null),
});

const updateSchema = Joi.object({
  name: Joi.string().min(1).max(200),
  price: Joi.number().integer().min(0), // paise
  description: Joi.string().allow('', null),
  unit: Joi.string().min(1).max(40),
  image_url: Joi.string().uri().allow('', null),
  is_active: Joi.boolean(),
});

router.use(auth(['owner', 'staff']));
router.get('/', asyncHandler(ctrl.list));
router.post('/', validate(createSchema), asyncHandler(ctrl.create));
router.get('/:id', asyncHandler(ctrl.get));
router.patch('/:id', validate(updateSchema), asyncHandler(ctrl.update));
router.delete('/:id', asyncHandler(ctrl.remove));

module.exports = router;
