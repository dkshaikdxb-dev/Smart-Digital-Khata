const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const customerCtrl = require('../controllers/customer.controller');

// Unauthenticated, read-only. Access is the unguessable 32-hex share token.
// Covered by the global /api rate limiter.
router.get('/khata/:token', asyncHandler(customerCtrl.publicKhata));

module.exports = router;
