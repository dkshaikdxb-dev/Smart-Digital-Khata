const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/summary.controller');

// QUERY VALIDATION (batch DATA D5). `?from=yesterday` reached the controller
// untouched, was bound to a `::timestamptz` cast and 500'd with raw Postgres text
// ("invalid input syntax for type timestamp") in the response body. report.routes
// has validated its range for ages; this route is the same shape and now uses the
// same schema, so a typo is a clean 400 that names the field.
const rangeSchema = Joi.object({
  from: Joi.date().iso(),
  to: Joi.date().iso(),
});

router.use(auth(['owner', 'staff']));
router.get('/today', asyncHandler(ctrl.today));
router.get('/range', validate(rangeSchema, 'query'), asyncHandler(ctrl.range));
router.get('/outstanding', asyncHandler(ctrl.outstanding));

module.exports = router;
