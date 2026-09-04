const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const customerCtrl = require('../controllers/customer.controller');
const productCtrl = require('../controllers/product.controller');

// Unauthenticated, read-only. Access is the unguessable 32-hex share token.
// Covered by the global /api rate limiter.
router.get('/khata/:token', asyncHandler(customerCtrl.publicKhata));

// Unauthenticated, read-only shop catalog: active products only, minimal fields.
router.get('/catalog/:shopId', asyncHandler(productCtrl.publicCatalog));

module.exports = router;
