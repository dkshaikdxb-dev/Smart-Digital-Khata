const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const customerRoutes = require('./customer.routes');
const ledgerRoutes = require('./ledger.routes');
const shopRoutes = require('./shop.routes');
const dashboardRoutes = require('./dashboard.routes');

router.use('/auth', authRoutes);
router.use('/customers', customerRoutes);
router.use('/ledger', ledgerRoutes);
router.use('/shops', shopRoutes);
router.use('/dashboard', dashboardRoutes);

module.exports = router;
