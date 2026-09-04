const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/analytics.controller');

// `days` is clamped to 1..365 in the controller, so accept any integer here.
const overviewSchema = Joi.object({
  days: Joi.number().integer(),
});

router.use(auth(['owner', 'staff']));
router.get('/overview', validate(overviewSchema, 'query'), asyncHandler(ctrl.overview));
router.get('/aging', asyncHandler(ctrl.aging));

module.exports = router;
