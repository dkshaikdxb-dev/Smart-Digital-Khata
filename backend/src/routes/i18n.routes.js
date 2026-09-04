const auth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/i18n.controller');

// PUBLIC router — mounted at /api/i18n. The customer app reads live overrides
// here without auth.
const router = require('express').Router();
router.get('/overrides', asyncHandler(ctrl.overrides));

// ADMIN router — mounted at /api/admin/i18n. Only platform admins may edit.
const adminRouter = require('express').Router();
adminRouter.patch('/', auth(['admin']), asyncHandler(ctrl.upsert));

module.exports = { router, adminRouter };
