const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const loadAdminRole = require('../middleware/loadAdminRole');
const requirePerm = require('../middleware/requirePerm');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/admin.controller');
const referralCtrl = require('../controllers/referral.controller');
const exportCtrl = require('../controllers/admin-export.controller');
const dashboardCtrl = require('../controllers/dashboard.controller');

const updateShopSchema = Joi.object({
  status: Joi.string().valid('active', 'suspended'),
  plan: Joi.string().valid('free', 'pro', 'family'),
  // Optional moderation note recorded in the audit log on a status change.
  reason: Joi.string().max(1000).allow('', null),
}).min(1);

const reasonSchema = Joi.object({
  reason: Joi.string().max(1000).allow('', null),
});

const adminRoleSchema = Joi.object({
  admin_role: Joi.string().valid('super', 'support', 'finance', 'moderation').allow(null),
  reason: Joi.string().max(1000).allow('', null),
}).min(1);

const settingsSchema = Joi.object({
  razorpay_key_id: Joi.string().allow(''),
  razorpay_key_secret: Joi.string().allow(''),
  razorpay_webhook_secret: Joi.string().allow(''),
  razorpay_plan_pro: Joi.string().allow(''),
  razorpay_plan_family: Joi.string().allow(''),
  whatsapp_api_url: Joi.string().allow(''),
  whatsapp_api_token: Joi.string().allow(''),
  whatsapp_phone_number_id: Joi.string().allow(''),
  whatsapp_business_account_id: Joi.string().allow(''),
  whatsapp_verify_token: Joi.string().allow(''),
  whatsapp_template_reminder: Joi.string().allow(''),
  whatsapp_template_lang: Joi.string().allow(''),
  landing_whatsapp: Joi.string().allow('').max(20),
}).min(1);

// Referrals (Phase D): create an offline influencer/other code, and the reward
// rule scaffolding stored in platform_settings.
const createCodeSchema = Joi.object({
  label: Joi.string().max(120).allow('', null),
  owner_type: Joi.string().valid('influencer', 'other').required(),
});

const rewardRuleSchema = Joi.object({
  enabled: Joi.boolean(),
  amount_paise: Joi.number().integer().min(0).max(100000000),
}).min(1);

// auth guarantees role='admin'; loadAdminRole resolves the admin SUB-role onto
// req.adminRole for requirePerm() and the controllers.
router.use(auth('admin'));
router.use(asyncHandler(loadAdminRole));

// Caller identity + permission set (drives the permission-aware frontend).
router.get('/me', asyncHandler(ctrl.me));

// Control-room dashboard (Phase E): read-only aggregation + rule-based insights.
// No single requirePerm gate — the controller includes only the sections the
// caller's admin sub-role may see (via hasPermission on req.adminRole) and
// derives insights from just those. auth('admin') already blocks non-admins.
router.get('/dashboard', asyncHandler(dashboardCtrl.dashboard));

// Platform overview + shop directory (read).
router.get('/stats', requirePerm('shops:view'), asyncHandler(ctrl.stats));
router.get('/shops', requirePerm('shops:view'), asyncHandler(ctrl.listShops));
router.get('/shops/:id', requirePerm('shops:view'), asyncHandler(ctrl.getShop));
// Mixed status/plan edit: permission is checked per-field inside the controller
// (status → shops:moderate; plan → settings:manage or shops:moderate).
router.patch('/shops/:id', validate(updateShopSchema), asyncHandler(ctrl.updateShop));

// Login users (owners/staff/admins).
router.get('/users', requirePerm('users:view'), asyncHandler(ctrl.listUsers));
router.post('/users/:id/block', requirePerm('users:moderate'), validate(reasonSchema), asyncHandler(ctrl.blockUser));
router.post('/users/:id/unblock', requirePerm('users:moderate'), validate(reasonSchema), asyncHandler(ctrl.unblockUser));
router.patch('/users/:id/admin-role', requirePerm('admin:manage'), validate(adminRoleSchema), asyncHandler(ctrl.setAdminRole));

// Consumer accounts.
router.get('/customers', requirePerm('customers:view'), asyncHandler(ctrl.listCustomers));
router.post('/customers/:id/block', requirePerm('customers:moderate'), validate(reasonSchema), asyncHandler(ctrl.blockCustomer));
router.post('/customers/:id/unblock', requirePerm('customers:moderate'), validate(reasonSchema), asyncHandler(ctrl.unblockCustomer));

// Moderation audit log.
router.get('/moderation-log', requirePerm('audit:view'), asyncHandler(ctrl.moderationLog));

// Platform integration settings (billing/messaging).
router.get('/settings', requirePerm('settings:manage'), asyncHandler(ctrl.getSettings));
router.patch('/settings', requirePerm('settings:manage'), validate(settingsSchema), asyncHandler(ctrl.updateSettings));
router.post('/settings/razorpay/test', requirePerm('settings:manage'), asyncHandler(ctrl.testRazorpay));
router.post('/settings/whatsapp/test', requirePerm('settings:manage'), validate(Joi.object({ to: Joi.string().required() })), asyncHandler(ctrl.testWhatsapp));

// Referrals / onboarding-source analytics (Phase D). Reads gated with
// revenue:view (super/finance), writes with settings:manage (super/finance).
router.get('/referrals/overview', requirePerm('revenue:view'), asyncHandler(referralCtrl.overview));
router.get('/referrals/reward-rule', requirePerm('revenue:view'), asyncHandler(referralCtrl.getRewardRule));
router.patch('/referrals/reward-rule', requirePerm('settings:manage'), validate(rewardRuleSchema), asyncHandler(referralCtrl.setRewardRule));
router.post('/referral-codes', requirePerm('settings:manage'), validate(createCodeSchema), asyncHandler(referralCtrl.createReferralCode));

// Role-based CSV exports. Each is gated by the permission for the data it emits,
// so a caller only downloads what their admin sub-role is allowed to see.
router.get('/exports/shops.csv', requirePerm('shops:view'), asyncHandler(exportCtrl.shopsCsv));
router.get('/exports/users.csv', requirePerm('users:view'), asyncHandler(exportCtrl.usersCsv));
router.get('/exports/moderation-log.csv', requirePerm('audit:view'), asyncHandler(exportCtrl.moderationLogCsv));
router.get('/exports/referrals.csv', requirePerm('revenue:view'), asyncHandler(exportCtrl.referralsCsv));
router.get('/exports/revenue.csv', requirePerm('revenue:view'), asyncHandler(exportCtrl.revenueCsv));

module.exports = router;
