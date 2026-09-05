const router = require('express').Router();
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/owner-insights.controller');

// Owner Help "lane A" (Phase F): plain-language shop nudges for the owner home.
// Shop-scoped via req.user.shopId; owner + staff of THIS shop only.
router.use(auth(['owner', 'staff']));
router.get('/owner', asyncHandler(ctrl.ownerNudges));

module.exports = router;
