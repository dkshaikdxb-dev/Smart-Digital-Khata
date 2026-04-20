const router = require('express').Router();
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/subscription.controller');

router.use(auth());
router.get('/plans', asyncHandler(ctrl.listPlans));
router.get('/me', asyncHandler(ctrl.getMine));
router.post('/upgrade', asyncHandler(ctrl.upgrade));
router.post('/cancel', asyncHandler(ctrl.cancel));

module.exports = router;
