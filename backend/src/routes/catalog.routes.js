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

// Query validation for the browse endpoints. Everything is optional so the
// default (no query) behaves exactly as before.
//
// `lang` is deliberately NOT constrained to a list here. It used to be a copy of
// the same seven codes the controllers hardcoded, which turned an owner asking
// for the Bengali catalogue into a 400 — a validation error for a language the
// app ships, activates and has 481 translated terms for. Which languages have a
// localized catalogue is a fact about the data, it lives in the `languages`
// registry, and the controller reads it there (resolveCatalogueLang), falling
// back to 'en' for anything else. Mirrors public.routes, which already lets the
// controller decide. unknown(true) keeps any other query keys untouched.
const listQuerySchema = Joi.object({
  lang: Joi.string().max(8),
  search: Joi.string().allow(''),
  category: Joi.string().allow(''),
  subcategory: Joi.string().allow(''),
  limit: Joi.number().integer(),
  cursor: Joi.string().allow(''),
}).unknown(true);

const categoriesQuerySchema = Joi.object({
  lang: Joi.string().max(8),
}).unknown(true);

const customSchema = Joi.object({
  product: Joi.string().min(1).max(200).required(),
  brand: Joi.string().max(120).allow('', null),
  pack: Joi.string().max(60).allow('', null),
  category: Joi.string().max(120).allow('', null),
  subcategory: Joi.string().max(120).allow('', null),
  unit: Joi.string().max(40).allow('', null),
  sold_by_weight: Joi.boolean(), // loose selling: price is per KG, unit forced to 'kg'
  price: Joi.number().integer().min(0).required(), // paise (per KG when sold_by_weight)
});

// All catalog routes are owner/staff, shop-scoped.
router.use(auth(['owner', 'staff']));

router.get('/', validate(listQuerySchema, 'query'), asyncHandler(ctrl.list));
router.get('/categories', validate(categoriesQuerySchema, 'query'), asyncHandler(ctrl.categories));
router.post('/select', validate(selectSchema), asyncHandler(ctrl.select));
router.post('/select-bulk', validate(selectBulkSchema), asyncHandler(ctrl.selectBulk));
router.post('/custom', validate(customSchema), asyncHandler(ctrl.custom));

module.exports = router;
