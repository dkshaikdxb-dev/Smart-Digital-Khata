const router = require('express').Router();
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/admin.controller');

router.use(auth('admin'));
router.get('/stats', asyncHandler(ctrl.stats));
router.get('/shops', asyncHandler(ctrl.listShops));
router.get('/users', asyncHandler(ctrl.listUsers));

module.exports = router;
