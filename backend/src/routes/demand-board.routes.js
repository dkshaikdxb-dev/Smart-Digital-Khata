const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/demand.controller');

const idParamSchema = Joi.object({ id: Joi.string().uuid().required() });

// Distributor (incl. farmer) view of the demand board, scoped to the caller's
// distributor row via requireDistributor.
router.use(auth(['distributor']));

router.get('/', asyncHandler(ctrl.listBoard));
router.post('/:id/claim', validate(idParamSchema, 'params'), asyncHandler(ctrl.claim));

module.exports = router;
