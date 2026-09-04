const router = require('express').Router();

router.use('/auth', require('./auth.routes'));
router.use('/customer-auth', require('./customer-auth.routes'));
router.use('/my', require('./my.routes'));
router.use('/shops', require('./shop.routes'));
router.use('/shops', require('./shop-payment.routes'));
router.use('/customers', require('./customer.routes'));
router.use('/products', require('./product.routes'));
router.use('/families', require('./family.routes'));
router.use('/transactions', require('./transaction.routes'));
router.use('/payments', require('./payment.routes'));
router.use('/subscriptions', require('./subscription.routes'));
router.use('/summaries', require('./summary.routes'));
router.use('/reports', require('./report.routes'));
router.use('/analytics', require('./analytics.routes'));
router.use('/notifications', require('./notification.routes'));
router.use('/admin', require('./admin.routes'));
router.use('/webhooks', require('./webhook.routes'));
router.use('/public', require('./public.routes'));

module.exports = router;
