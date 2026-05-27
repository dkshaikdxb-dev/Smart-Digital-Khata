const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const customerRoutes = require('./customer.routes');
const ledgerRoutes = require('./ledger.routes');
const shopRoutes = require('./shop.routes');
const dashboardRoutes = require('./dashboard.routes');
const notificationRoutes = require('./notification.routes');
const reportRoutes = require('./report.routes');
const dueAgingRoutes = require('./due-aging.routes');
const subscriptionRoutes = require('./subscription.routes');
const paymentRoutes = require('./payment.routes');
const aiInsightsRoutes = require('./ai-insights.routes');

router.use('/auth', authRoutes);
router.use('/customers', customerRoutes);
router.use('/ledger', ledgerRoutes);
router.use('/shops', shopRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/notifications', notificationRoutes);
router.use('/reports', reportRoutes);
router.use('/due-aging', dueAgingRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/payments', paymentRoutes);
router.use('/ai-insights', aiInsightsRoutes);

module.exports = router;
