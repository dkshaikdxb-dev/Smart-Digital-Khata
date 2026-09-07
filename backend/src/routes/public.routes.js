const router = require('express').Router();
const Joi = require('joi');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const customerCtrl = require('../controllers/customer.controller');
const productCtrl = require('../controllers/product.controller');
const discoveryCtrl = require('../controllers/discovery.controller');
const configCtrl = require('../controllers/config.controller');
const contentPublicCtrl = require('../controllers/content-public.controller');

// Public runtime config for the marketing landing (safe values only).
router.get('/config', asyncHandler(configCtrl.publicConfig));

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

// Cross-shop product search (Flipkart-style). Active products in listed shops
// whose (localized or base) name matches `q`. Same query-param style as the
// directory; `q` is required.
const searchSchema = Joi.object({
  q: Joi.string().trim().min(1).max(120).required(),
  city: Joi.string().trim().max(120),
  lat: Joi.number().min(-90).max(90),
  lng: Joi.number().min(-180).max(180),
  lang: Joi.string(),
  limit: Joi.number().integer(),
});
router.get('/products/search', validate(searchSchema, 'query'), asyncHandler(discoveryCtrl.searchProducts));

router.get('/shops/:shopId', asyncHandler(discoveryCtrl.getShop));

// Content engine (Batch T) — the public marketing-site blog. Read-only, only
// published posts, minimal fields on the list.
router.get('/blog', asyncHandler(contentPublicCtrl.listBlog));
router.get('/blog/:slug', asyncHandler(contentPublicCtrl.getBlog));

// Content engine (Batch T) — newsletter double-opt-in. The subscribe body is
// validated + email-checked; the confirm/unsubscribe links carry an opaque
// token. None of these reveal whether an address already existed. Rate-limited
// by the existing global /api limiter.
const subscribeSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().max(320).required(),
  list: Joi.string().valid('community', 'ecosystem').default('community'),
});
router.post(
  '/newsletter/subscribe',
  validate(subscribeSchema, 'body'),
  asyncHandler(contentPublicCtrl.subscribeNewsletter)
);
router.get('/newsletter/confirm', asyncHandler(contentPublicCtrl.confirmNewsletter));
router.get('/newsletter/unsubscribe', asyncHandler(contentPublicCtrl.unsubscribeNewsletter));

module.exports = router;
