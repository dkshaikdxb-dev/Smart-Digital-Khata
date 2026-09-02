const router = require('express').Router();

router.use('/auth', require('./auth.routes'));
router.use('/shops', require('./shop.routes'));
router.use('/customers', require('./customer.routes'));
router.use('/transactions', require('./transaction.routes'));
router.use('/payments', require('./payment.routes'));
router.use('/subscriptions', require('./subscription.routes'));
router.use('/summaries', require('./summary.routes'));
router.use('/notifications', require('./notification.routes'));
router.use('/admin', require('./admin.routes'));
router.use('/webhooks', require('./webhook.routes'));
router.use('/public', require('./public.routes'));

module.exports = router;
