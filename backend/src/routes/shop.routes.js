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
  // Repeating new-order alert (batch ORDERALERT). The interval and the repeat
  // count are CLAMPED to the live platform bounds in the controller — Joi only
  // keeps nonsense out, so an owner who types 1 gets the platform minimum
  // rather than a 422 in the middle of a rush. `order_alert_muted_until` is
  // deliberately NOT settable here: muting goes through
  // POST /api/orders/alerts/mute, which owns the 1..720 window.
  order_alert_enabled: Joi.boolean(),
  order_alert_repeat_minutes: Joi.number().integer().min(1).max(1440),
  order_alert_max_repeats: Joi.number().integer().min(0).max(1000),
  // Shop availability (batch A). `is_open` is the master switch the owner's
  // Home screen flips. The daily window is 'HH:MM' (or null to clear) and must
  // be sent as a PAIR — the controller rejects a one-sided window with 422
  // `hours_incomplete`. `paused_until` is deliberately NOT settable here: a
  // pause goes through POST /api/shops/me/pause, which owns the clamp.
  is_open: Joi.boolean(),
  open_time: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).allow('', null),
  close_time: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).allow('', null),
});

// Shop availability (batch A). These are shop POLICY, not integration
// credentials — they save with NO typed I CONFIRM, exactly like the fulfillment
// and order-alert settings beside them.
//
// `minutes`: 0 clears the pause, a number is clamped to 1..shop_pause_max_minutes
// in the controller (so an owner who types 9999 mid-rush gets the ceiling, not
// an error), and the string 'today' means "rest of today" in the shop timezone.
const pauseSchema = Joi.object({
  minutes: Joi.alternatives()
    .try(Joi.number().integer().min(0).max(43200), Joi.string().valid('today'))
    .required(),
});

const closureSchema = Joi.object({
  on_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  reason: Joi.string().trim().max(120).allow('', null),
});

const closureIdSchema = Joi.object({
  id: Joi.string().required(),
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
// Shop availability (batch A) — owner+staff, shop-scoped, reusing the guard
// above. Whoever can mind the counter can also say "we're shut for an hour".
router.post('/me/pause', validate(pauseSchema), asyncHandler(ctrl.pauseShop));
router.post('/me/closures', validate(closureSchema), asyncHandler(ctrl.addClosure));
router.delete(
  '/me/closures/:id',
  validate(closureIdSchema, 'params'),
  asyncHandler(ctrl.deleteClosure)
);

router.get('/me/name-i18n', asyncHandler(ctrl.getNameI18n));
router.put(
  '/me/name-i18n/:lang',
  validate(nameI18nParamSchema, 'params'),
  validate(nameI18nBodySchema),
  asyncHandler(ctrl.putNameI18n)
);

module.exports = router;
