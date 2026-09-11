const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/shop.controller');

// PUBLIC storefront gallery photo serve (batch LITE) — mounted at
// /api/shop-images. The consumer carousel embeds these without auth via the
// cache-busted url getShop / the owner list return. `:id` is UUID-validated in
// the controller (malformed → 404). Kept as its own top-level mount so the id
// space is the shop_images row id, not the shop id.
router.get('/:id', asyncHandler(ctrl.serveGalleryImage));

module.exports = router;
