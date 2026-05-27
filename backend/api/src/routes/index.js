const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const customerRoutes = require('./customer.routes');
const ledgerRoutes = require('./ledger.routes');

router.use('/auth', authRoutes);
router.use('/customers', customerRoutes);
router.use('/ledger', ledgerRoutes);

module.exports = router;
