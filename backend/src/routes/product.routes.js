const router = require('express').Router();
const Joi = require('joi');
const multer = require('multer');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const ctrl = require('../controllers/product.controller');

// Multer is scoped to the single upload route only (below), so it never touches
// the global express.json / raw webhook body parsing. Memory storage keeps the
// file as a Buffer — it goes straight to Postgres, never to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }, // 5MB hard cap, pre-resize
});

// Run multer for the `image` field and translate its errors (e.g. file too
// large, too many files) into a 400 instead of a generic 500.
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

const createSchema = Joi.object({
  name: Joi.string().min(1).max(200).required(),
  price: Joi.number().integer().min(0).default(0), // paise (per KG when sold_by_weight)
  description: Joi.string().allow('', null),
  unit: Joi.string().min(1).max(40),
  sold_by_weight: Joi.boolean(), // loose selling: price is per KG, unit forced to 'kg'
  image_url: Joi.string().uri().allow('', null),
});

const updateSchema = Joi.object({
  name: Joi.string().min(1).max(200),
  price: Joi.number().integer().min(0), // paise (per KG when sold_by_weight)
  description: Joi.string().allow('', null),
  unit: Joi.string().min(1).max(40),
  sold_by_weight: Joi.boolean(),
  image_url: Joi.string().uri().allow('', null),
  is_active: Joi.boolean(),
});

// PUBLIC image serve — consumers browse listed shops without auth. Declared
// BEFORE the auth guard below so it is not caught by it. Reachable under the
// existing /api mount (no new top-level mount needed).
router.get('/:id/image', asyncHandler(ctrl.serveImage));

router.use(auth(['owner', 'staff']));
router.get('/', asyncHandler(ctrl.list));
router.post('/', validate(createSchema), asyncHandler(ctrl.create));
router.get('/:id', asyncHandler(ctrl.get));
router.patch('/:id', validate(updateSchema), asyncHandler(ctrl.update));
router.delete('/:id', asyncHandler(ctrl.remove));

// Owner/staff, shop-scoped image upload + clear.
router.post('/:id/image', uploadImageField, asyncHandler(ctrl.uploadImage));
router.delete('/:id/image', asyncHandler(ctrl.deleteImage));

module.exports = router;
