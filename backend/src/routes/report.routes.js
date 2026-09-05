const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/report.controller');

const rangeSchema = Joi.object({
  from: Joi.date().iso(),
  to: Joi.date().iso(),
});

const idParamSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

router.use(auth(['owner', 'staff']));
router.get('/customers.csv', asyncHandler(ctrl.customersCsv));
router.get('/transactions.csv', validate(rangeSchema, 'query'), asyncHandler(ctrl.transactionsCsv));
router.get('/orders.csv', validate(rangeSchema, 'query'), asyncHandler(ctrl.ordersCsv));
router.get('/catalogue.csv', asyncHandler(ctrl.catalogueCsv));
router.get('/khata-outstanding.csv', asyncHandler(ctrl.khataOutstandingCsv));
router.get(
  '/customer/:id/statement.csv',
  validate(idParamSchema, 'params'),
  asyncHandler(ctrl.statementCsv)
);

module.exports = router;
