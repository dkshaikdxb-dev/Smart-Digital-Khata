const router = require('express').Router();
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/summary.controller');

router.use(auth());
router.get('/today', asyncHandler(ctrl.today));
router.get('/range', asyncHandler(ctrl.range));
router.get('/outstanding', asyncHandler(ctrl.outstanding));

module.exports = router;
