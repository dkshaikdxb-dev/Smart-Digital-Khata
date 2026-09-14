const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/transaction.controller');

const createSchema = Joi.object({
  customer_id: Joi.string().uuid().required(),
  type: Joi.string().valid('purchase', 'cash', 'upi').required(),
  // Integer paise only (matches payment.routes / my.routes). A fractional or
  // exponential value is a clean 400, never a 500 / BIGINT error. Ceiling is
  // ₹10 crore in paise.
  amount: Joi.number().integer().positive().max(1_000_000_000_000).required(),
  method: Joi.string().valid('cash', 'upi', 'credit', 'razorpay').default('credit'),
  note: Joi.string().max(500).allow('', null),
  // Optional client-generated id for idempotent retries from offline/2G clients.
  client_request_id: Joi.string().uuid().optional(),
});

// QUERY VALIDATION for the ledger list (batch DATA D5). Three parameters reached
// SQL unchecked and each 500'd with raw Postgres text:
//   ?customer_id=abc  -> "invalid input syntax for type uuid"
//   ?limit=abc        -> Number('abc') is NaN -> LIMIT NaN
//   ?from=yesterday   -> invalid timestamp input
// The bounds mirror what the controller already intended: limit defaults to 100
// and is capped at 500, and `type` is the same vocabulary the create schema uses
// plus 'adjustment' (a real ledger type since 0068, so it must be filterable).
const listQuerySchema = Joi.object({
  customer_id: Joi.string().uuid(),
  type: Joi.string().valid('purchase', 'cash', 'upi', 'adjustment'),
  from: Joi.date().iso(),
  to: Joi.date().iso(),
  limit: Joi.number().integer().min(1).max(500).default(100),
});

router.use(auth(['owner', 'staff']));
router.get('/', validate(listQuerySchema, 'query'), asyncHandler(ctrl.list));
router.post('/', validate(createSchema), asyncHandler(ctrl.create));
router.get('/:id', asyncHandler(ctrl.get));

module.exports = router;
