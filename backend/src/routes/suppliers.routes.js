const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/distributor.controller');

const listQuerySchema = Joi.object({
  category: Joi.string().max(80),
  brand: Joi.string().max(80),
  kind: Joi.string().valid('distributor', 'farmer'),
  fresh: Joi.string().valid('1', 'true'),
});

const ledgerQuerySchema = Joi.object({
  distributor_id: Joi.string().uuid(),
});

// Owner/staff view of the supply side, scoped to req.user.shopId.
router.use(auth(['owner', 'staff']));

router.get('/', validate(listQuerySchema, 'query'), asyncHandler(ctrl.listSuppliers));
router.get('/ledger', validate(ledgerQuerySchema, 'query'), asyncHandler(ctrl.suppliersLedger));

module.exports = router;
