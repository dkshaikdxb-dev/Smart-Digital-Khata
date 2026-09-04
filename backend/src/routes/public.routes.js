const router = require('express').Router();
const Joi = require('joi');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const customerCtrl = require('../controllers/customer.controller');
const productCtrl = require('../controllers/product.controller');
const discoveryCtrl = require('../controllers/discovery.controller');

// Unauthenticated, read-only. Access is the unguessable 32-hex share token.
// Covered by the global /api rate limiter.
router.get('/khata/:token', asyncHandler(customerCtrl.publicKhata));

// Unauthenticated, read-only shop catalog: active products only, minimal fields.
router.get('/catalog/:shopId', asyncHandler(productCtrl.publicCatalog));

// Shop Discovery (M6) — public directory of opted-in (is_listed) shops.
const listSchema = Joi.object({
  search: Joi.string().trim().max(120),
  city: Joi.string().trim().max(120),
  lat: Joi.number().min(-90).max(90),
  lng: Joi.number().min(-180).max(180),
  limit: Joi.number().integer(),
});

router.get('/shops', validate(listSchema, 'query'), asyncHandler(discoveryCtrl.listShops));
router.get('/shops/:shopId', asyncHandler(discoveryCtrl.getShop));

module.exports = router;
