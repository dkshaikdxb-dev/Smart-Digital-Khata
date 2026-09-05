const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/catalog.controller');

const selectSchema = Joi.object({
  catalog_item_id: Joi.string().guid({ version: ['uuidv4', 'uuidv1'] }).required(),
  price: Joi.number().integer().min(0).required(), // paise
});

const selectBulkSchema = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        catalog_item_id: Joi.string().guid({ version: ['uuidv4', 'uuidv1'] }).required(),
        price: Joi.number().integer().min(0).required(), // paise
      })
    )
    .min(1)
    .max(100)
    .required(),
});

const customSchema = Joi.object({
  product: Joi.string().min(1).max(200).required(),
  brand: Joi.string().max(120).allow('', null),
  pack: Joi.string().max(60).allow('', null),
  category: Joi.string().max(120).allow('', null),
  subcategory: Joi.string().max(120).allow('', null),
  unit: Joi.string().max(40).allow('', null),
  price: Joi.number().integer().min(0).required(), // paise
});

// All catalog routes are owner/staff, shop-scoped.
router.use(auth(['owner', 'staff']));

router.get('/', asyncHandler(ctrl.list));
router.get('/categories', asyncHandler(ctrl.categories));
router.post('/select', validate(selectSchema), asyncHandler(ctrl.select));
router.post('/select-bulk', validate(selectBulkSchema), asyncHandler(ctrl.selectBulk));
router.post('/custom', validate(customSchema), asyncHandler(ctrl.custom));

module.exports = router;
