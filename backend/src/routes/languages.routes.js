const auth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/languages.controller');

// PUBLIC router — mounted at /api/public/languages. The picker/gate read the
// active language set here without auth.
const router = require('express').Router();
router.get('/', asyncHandler(ctrl.publicList));

// ADMIN router — mounted at /api/admin/languages. Only platform admins manage
// the registry (the one-button activate/deactivate + pre-staging).
const adminRouter = require('express').Router();
adminRouter.use(auth(['admin']));
adminRouter.get('/', asyncHandler(ctrl.adminList));
adminRouter.post('/', asyncHandler(ctrl.adminCreate));
adminRouter.patch('/:code', asyncHandler(ctrl.adminUpdate));

module.exports = { router, adminRouter };
