const router = require('express').Router();
const Joi = require('joi');
const multer = require('multer');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ctrl = require('../controllers/shop.controller');

// Multer scoped to the single cover-upload route only (memory storage; the file
// goes straight to Postgres, never to disk). 5MB hard cap, one file — the client
// ImageStudio has already shrunk it, this is the pre-resize ceiling.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

// Run multer for the `image` field and translate its errors into a 400.
function uploadImageField(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        return next(ApiError.badRequest(`Image upload failed: ${err.message}`));
      }
      return next(err);
    }
    return next();
  });
}

const updateSchema = Joi.object({
  name: Joi.string().min(2).max(120),
  notification_mode: Joi.string().valid('silent', 'smart', 'active'),
  default_credit_limit: Joi.number().min(0),
  daily_digest: Joi.boolean(),
  // Owner Help "lane B": weekly WhatsApp summary opt-in (Batch J).
  weekly_summary: Joi.boolean(),
  // Shop Discovery (M6): public directory opt-in + location. null clears a
  // field so an owner can wipe their location / opt out of the geo directory.
  city: Joi.string().allow('', null).max(120),
  area: Joi.string().allow('', null).max(120),
  // Location foundation (LOC1): village + PIN granularity for geo targeting.
  // null/'' clears the field. pincode is a free-form string here (owner-facing);
  // the consumer picker validates 4–6 digits.
  pincode: Joi.string().allow('', null).max(12),
  village: Joi.string().allow('', null).max(120),
  latitude: Joi.number().min(-90).max(90).allow(null),
  longitude: Joi.number().min(-180).max(180).allow(null),
  is_listed: Joi.boolean(),
  // Fulfillment (M7): pickup/delivery availability, flat delivery fee, an
  // optional free-delivery threshold, a delivery minimum-order gate, plus
  // informational radius/hours. All money is integer paise. null clears the
  // nullable fields (free_delivery_min, radius, hours).
  offers_pickup: Joi.boolean(),
  offers_delivery: Joi.boolean(),
  delivery_fee: Joi.number().integer().min(0),
  free_delivery_min: Joi.number().integer().min(0).allow(null),
  delivery_min_order: Joi.number().integer().min(0),
  delivery_radius_km: Joi.number().min(0).max(100).allow(null),
  delivery_hours: Joi.string().allow('', null).max(120),
});

// Premium "Branded Store" (batch STORE1). Owner-scoped: buying premium is an
// owner decision, so staff are excluded (unlike the /me/* shop-settings routes,
// which allow owner+staff). Activation debits credits; the accent/tagline PATCH is
// allowed anytime (the owner can pre-set before activating).
const brandingActivateSchema = Joi.object({
  // Coarse upper bound; the LIVE max_days is re-clamped in the controller.
  days: Joi.number().integer().min(1).max(365).required(),
});
const brandingPatchSchema = Joi.object({
  // #RRGGBB hex; null (or '') clears it back to the default (unbranded) accent.
  brand_accent: Joi.string().pattern(/^#[0-9a-fA-F]{6}$/).allow('', null),
  brand_tagline: Joi.string().trim().max(80).allow('', null),
}).min(0);

// Owner override of the native shop name (batch SHOPNAME). One language per PUT;
// the name is validated + trimmed + length-capped in the controller.
const nameI18nParamSchema = Joi.object({
  lang: Joi.string().trim().lowercase().required(),
});
const nameI18nBodySchema = Joi.object({
  name: Joi.string().trim().min(1).max(120).required(),
});

// PUBLIC shop cover serve — the storefront header embeds it without auth.
// Declared BEFORE the auth guard below so it is not caught by it. `:id` is
// UUID-validated in the controller, so it never shadows the owner `/me/*` routes.
router.get('/:id/image', asyncHandler(ctrl.serveImage));

// Branded Store (batch STORE1) — OWNER-ONLY. Declared before the owner+staff
// guard below with their own auth(['owner']) so staff cannot spend the shop's
// credits on premium.
router.get('/me/branding', auth(['owner']), asyncHandler(ctrl.getBranding));
router.post(
  '/me/branding/activate',
  auth(['owner']),
  validate(brandingActivateSchema),
  asyncHandler(ctrl.activateBranding)
);
router.patch('/me/branding', auth(['owner']), validate(brandingPatchSchema), asyncHandler(ctrl.patchBranding));

// Storefront ad-free buy-out (batch STOREFRONT-FULL) — OWNER-ONLY, exactly like
// the Branded Store above: spending the shop's credits to keep the sponsored
// slide off the storefront is an owner decision. Same Joi day-cap; the LIVE
// max_days is re-clamped in the controller.
router.get('/me/storefront-ad-free', auth(['owner']), asyncHandler(ctrl.getStorefrontAdFree));
router.post(
  '/me/storefront-ad-free',
  auth(['owner']),
  validate(brandingActivateSchema),
  asyncHandler(ctrl.buyStorefrontAdFree)
);

router.use(auth(['owner', 'staff']));
router.get('/me', asyncHandler(ctrl.getMine));
router.patch('/me', validate(updateSchema), asyncHandler(ctrl.updateMine));
// Owner/staff, shop-scoped cover upload.
router.post('/me/image', uploadImageField, asyncHandler(ctrl.uploadImage));
// Owner/staff, shop-scoped storefront photo gallery (batch LITE). Up to 3
// photos; the SAME multer + sharp pipeline as the cover. list / add (409 when
// full) / delete (scoped).
router.get('/me/images', asyncHandler(ctrl.listImages));
router.post('/me/images', uploadImageField, asyncHandler(ctrl.uploadGalleryImage));
router.delete('/me/images/:id', asyncHandler(ctrl.deleteImage));
router.get('/me/name-i18n', asyncHandler(ctrl.getNameI18n));
router.put(
  '/me/name-i18n/:lang',
  validate(nameI18nParamSchema, 'params'),
  validate(nameI18nBodySchema),
  asyncHandler(ctrl.putNameI18n)
);

module.exports = router;
