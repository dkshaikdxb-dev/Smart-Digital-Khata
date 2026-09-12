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
const distributorCtrl = require('../controllers/distributor.controller');
const analyticsCtrl = require('../controllers/admin-analytics.controller');
const adsCtrl = require('../controllers/ads.controller');
const refCampaignCtrl = require('../controllers/referral-campaigns.controller');

const updateShopSchema = Joi.object({
  status: Joi.string().valid('active', 'suspended'),
  plan: Joi.string().valid('free', 'pro', 'family'),
  // Optional moderation note recorded in the audit log on a status change.
  reason: Joi.string().max(1000).allow('', null),
}).min(1);

const reasonSchema = Joi.object({
  reason: Joi.string().max(1000).allow('', null),
});

// Optional moderation note captured on a shop-promo approve/reject and persisted to
// ad_campaigns.review_note (shown to the owner). `review_note` is the canonical
// field; `reason` is still accepted for backward compatibility with the old queue.
const promoReviewSchema = Joi.object({
  review_note: Joi.string().max(1000).allow('', null),
  reason: Joi.string().max(1000).allow('', null),
});

const adminRoleSchema = Joi.object({
  admin_role: Joi.string().valid('super', 'support', 'finance', 'moderation', 'marketing').allow(null),
  reason: Joi.string().max(1000).allow('', null),
}).min(1);

const settingsSchema = Joi.object({
  razorpay_key_id: Joi.string().allow(''),
  razorpay_key_secret: Joi.string().allow('', null),
  razorpay_webhook_secret: Joi.string().allow('', null),
  razorpay_plan_pro: Joi.string().allow(''),
  razorpay_plan_family: Joi.string().allow(''),
  whatsapp_api_url: Joi.string().allow(''),
  whatsapp_api_token: Joi.string().allow('', null),
  whatsapp_phone_number_id: Joi.string().allow(''),
  whatsapp_business_account_id: Joi.string().allow(''),
  whatsapp_verify_token: Joi.string().allow(''),
  whatsapp_template_reminder: Joi.string().allow(''),
  whatsapp_template_lang: Joi.string().allow(''),
  landing_whatsapp: Joi.string().allow('').max(20),
  // Integrations (batch INTEG). Secrets: blank = keep, null = clear. Any body
  // touching an integration key must also carry confirm: 'I CONFIRM' — the
  // controller enforces it (428 confirmation_required, nothing written).
  confirm: Joi.string().allow(''),
  anthropic_api_key: Joi.string().allow('', null),
  moderation_llm_model: Joi.string().allow('', null).max(120),
  content_llm_model: Joi.string().allow('', null).max(120),
  meta_app_id: Joi.string().allow('', null).max(200),
  meta_app_secret: Joi.string().allow('', null),
  meta_page_token: Joi.string().allow('', null),
  meta_ig_token: Joi.string().allow('', null),
  smtp_url: Joi.string().allow('', null),
  smtp_host: Joi.string().allow('', null).max(255),
  smtp_port: Joi.alternatives().try(Joi.number().integer(), Joi.string().allow('')).allow(null),
  smtp_user: Joi.string().allow('', null).max(255),
  smtp_pass: Joi.string().allow('', null),
  smtp_secure: Joi.boolean(),
  newsletter_from: Joi.string().allow('', null).max(255),
  bhashini_nmt: Joi.boolean(),
  bhashini_api_key: Joi.string().allow('', null),
  bhashini_user_id: Joi.string().allow('', null).max(200),
  sarvam_api_key: Joi.string().allow('', null),
  // Feature flags & pricing (batch FLAGS1). All optional; the object keeps
  // .min(1). Booleans are real booleans; amounts/day-counts are non-negative
  // integers (max_days >= 1); split percents are integers in 0..100. The
  // controller coerces these to TEXT and enforces the zero-burn split guard +
  // the meta_autopost lock.
  voice_assistant_enabled: Joi.boolean(),
  social_share_enabled: Joi.boolean(),
  shop_promo_enabled: Joi.boolean(),
  branded_store_enabled: Joi.boolean(),
  consumer_prepay_enabled: Joi.boolean(),
  enrolment_fee_enabled: Joi.boolean(),
  storefront_ad_free_enabled: Joi.boolean(),
  meta_autopost_enabled: Joi.boolean(),
  enrolment_fee_basic_paise: Joi.number().integer().min(0),
  enrolment_fee_premium_paise: Joi.number().integer().min(0),
  shop_promo_credits_per_day_paise: Joi.number().integer().min(0),
  branded_store_credits_per_day_paise: Joi.number().integer().min(0),
  consumer_prepay_max_advance_paise: Joi.number().integer().min(0),
  delivery_champion_fee_paise: Joi.number().integer().min(0),
  shop_promo_max_days: Joi.number().integer().min(1),
  branded_store_max_days: Joi.number().integer().min(1),
  storefront_ad_free_credits_per_day_paise: Joi.number().integer().min(0),
  storefront_ad_free_max_days: Joi.number().integer().min(1),
  referral_split_infra_pct: Joi.number().integer().min(0).max(100),
  referral_split_l1_pct: Joi.number().integer().min(0).max(100),
  referral_split_l2_pct: Joi.number().integer().min(0).max(100),
  // AI moderation (batch AI-MOD, 0064): the master toggle and the two confidence
  // thresholds (decimals in 0.5..1.0) the job applies live.
  ai_moderation_enabled: Joi.boolean(),
  ai_moderation_auto_approve_min: Joi.number().min(0.5).max(1),
  ai_moderation_hold_min: Joi.number().min(0.5).max(1),
  // Repeating new-order alert (batch ORDERALERT, 0065): the platform bounds a
  // shop's own alert cadence is clamped to. Policy numbers, not credentials —
  // no I CONFIRM.
  order_alert_min_minutes: Joi.number().integer().min(1).max(720),
  order_alert_max_minutes: Joi.number().integer().min(1).max(720),
  order_alert_max_repeats_cap: Joi.number().integer().min(1).max(100),
  // Shop availability (batch A, 0066): the master kill-switch and the ceiling
  // on a single shop pause. Policy, not credentials — no I CONFIRM.
  shop_hours_enabled: Joi.boolean(),
  shop_pause_max_minutes: Joi.number().integer().min(1).max(43200),
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
  referee_paise: Joi.number().integer().min(0).max(100000000),
  mitra_paise: Joi.number().integer().min(0).max(100000000),
}).min(1);

// Flag/unflag a referral code as a Khata Mitra agent code.
const setMitraSchema = Joi.object({
  is_mitra: Joi.boolean().required(),
});

// Batch R3: configure a referral code — label, mitra flag, and the influencer
// flat bounty + budget cap (integer paise >= 0; budget nullable = uncapped).
const patchCodeSchema = Joi.object({
  label: Joi.string().max(120).allow('', null),
  is_mitra: Joi.boolean(),
  flat_bounty_paise: Joi.number().integer().min(0).max(100000000).allow(null),
  budget_cap_paise: Joi.number().integer().min(0).max(100000000000).allow(null),
}).min(1);

// Geo-targeted promo campaigns (ADS2). A campaign carries its geo targets; a
// target is a town(=shop.city)/village/pincode value, or 'all' (everyone, one
// row, geo_value null). link_* consistency + reference existence are checked in
// the controller (needs the DB); here we validate shape/enums.
const adTargetSchema = Joi.object({
  geo_type: Joi.string().valid('town', 'village', 'pincode', 'all').required(),
  geo_value: Joi.string().trim().max(120).when('geo_type', {
    is: 'all',
    then: Joi.optional().allow(null, ''),
    otherwise: Joi.required(),
  }),
});

const campaignSchema = Joi.object({
  style: Joi.string().valid('offer', 'product', 'shop', 'festival').required(),
  title: Joi.string().max(200).required(),
  offer_text: Joi.string().max(200).allow('', null),
  subtitle: Joi.string().max(300).allow('', null),
  glyph: Joi.string().max(40).allow('', null),
  image_url: Joi.string().max(2000).allow('', null),
  i18n: Joi.object().default({}),
  advertiser: Joi.string().max(200).allow('', null),
  link_type: Joi.string().valid('none', 'shop', 'product', 'brand', 'url').default('none'),
  link_shop_id: Joi.string().uuid().allow(null),
  link_product_id: Joi.string().uuid().allow(null),
  link_url: Joi.string().max(2000).allow('', null),
  is_seasonal: Joi.boolean().default(false),
  starts_at: Joi.date().iso().allow(null),
  ends_at: Joi.date().iso().allow(null),
  priority: Joi.number().integer().min(0).max(1000000).default(0),
  status: Joi.string().valid('draft', 'active', 'paused').default('draft'),
  // Where the campaign serves (batch STOREFRONT-FULL): the home-screen discovery
  // band (default, unchanged behaviour) or a shop storefront's sponsored slot.
  placement: Joi.string().valid('discovery', 'storefront').default('discovery'),
  targets: Joi.array().items(adTargetSchema).default([]),
});

const adStatusSchema = Joi.object({
  status: Joi.string().valid('draft', 'active', 'paused').required(),
});

// Per-shop trust toggle for storefront photos (batch STOREFRONT-FULL): when on,
// the shop's uploads publish without review.
const shopSlidesSchema = Joi.object({
  auto_publish: Joi.boolean().required(),
  reason: Joi.string().max(1000).allow('', null),
});

// Seasonal + geo referral campaigns (CAMP1). A campaign carries geo targets
// (town(=shop.city)/village/pincode, or 'all'); its budget must be > 0 (uncapped
// is not allowed). reward_value's SHAPE is validated per reward_type in the
// controller (needs the enum + budget together); here we validate shape/enums.
const refCampaignTargetSchema = Joi.object({
  geo_type: Joi.string().valid('town', 'village', 'pincode', 'all').required(),
  geo_value: Joi.string().trim().max(120).when('geo_type', {
    is: 'all',
    then: Joi.optional().allow(null, ''),
    otherwise: Joi.required(),
  }),
});

const refCampaignSchema = Joi.object({
  name: Joi.string().max(200).required(),
  status: Joi.string().valid('draft', 'active', 'paused', 'ended').default('draft'),
  audience: Joi.string().valid('all', 'shop', 'mitra', 'influencer', 'consumer').default('all'),
  reward_type: Joi.string().valid('multiplier', 'flat_override').required(),
  reward_value: Joi.object().default({}),
  budget_cap_paise: Joi.number().integer().min(1).max(100000000000).required(),
  starts_at: Joi.date().iso().allow(null),
  ends_at: Joi.date().iso().allow(null),
  is_seasonal: Joi.boolean().default(false),
  priority: Joi.number().integer().min(0).max(1000000).default(0),
  targets: Joi.array().items(refCampaignTargetSchema).min(1).required(),
});

const refCampaignStatusSchema = Joi.object({
  status: Joi.string().valid('draft', 'active', 'paused', 'ended').required(),
});

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

// Acquisition funnel (Analytics Phase 1). Read-only aggregation over the signup
// cohort + anonymous events. Gated with shops:view (growth/acquisition data, no
// money), like the dashboard's growth section.
router.get('/analytics/funnel', requirePerm('shops:view'), asyncHandler(analyticsCtrl.funnel));

// Platform overview + shop directory (read).
router.get('/stats', requirePerm('shops:view'), asyncHandler(ctrl.stats));
router.get('/shops', requirePerm('shops:view'), asyncHandler(ctrl.listShops));
router.get('/shops/:id', requirePerm('shops:view'), asyncHandler(ctrl.getShop));

// Distributor / supply directory (read). Gated with shops:view alongside the
// rest of the supply-side operational surface.
router.get('/distributors', requirePerm('shops:view'), asyncHandler(distributorCtrl.adminListDistributors));
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
router.post('/settings/ai/test', requirePerm('settings:manage'), asyncHandler(ctrl.testAi));
router.post('/settings/smtp/test', requirePerm('settings:manage'), asyncHandler(ctrl.testSmtp));
router.post('/settings/whatsapp/test', requirePerm('settings:manage'), validate(Joi.object({ to: Joi.string().required() })), asyncHandler(ctrl.testWhatsapp));

// Referrals / onboarding-source analytics (Phase D). Reads gated with
// revenue:view (super/finance), writes with settings:manage (super/finance).
router.get('/referrals/overview', requirePerm('revenue:view'), asyncHandler(referralCtrl.overview));
router.get('/referrals/reward-rule', requirePerm('revenue:view'), asyncHandler(referralCtrl.getRewardRule));
router.patch('/referrals/reward-rule', requirePerm('settings:manage'), validate(rewardRuleSchema), asyncHandler(referralCtrl.setRewardRule));
router.post('/referral-codes', requirePerm('settings:manage'), validate(createCodeSchema), asyncHandler(referralCtrl.createReferralCode));
router.patch('/referral-codes/:id', requirePerm('settings:manage'), validate(setMitraSchema), asyncHandler(referralCtrl.setMitra));

// Batch R3 — Khata Credits admin. Economics reuses the referral read permission
// (revenue:view, like the referral overview); code config + manual settle reuse
// the referral write permission (settings:manage, like reward-rule / code mgmt).
router.get('/referral/economics', requirePerm('revenue:view'), asyncHandler(referralCtrl.economics));
router.patch('/referral/codes/:id', requirePerm('settings:manage'), validate(patchCodeSchema), asyncHandler(referralCtrl.patchCode));
router.post('/referral/settle', requirePerm('settings:manage'), asyncHandler(referralCtrl.settlePending));

// Seasonal + geo referral campaigns (CAMP1). Reward overrides for a window +
// place + audience, hard-capped by a pre-funded budget. Same referral-admin
// permissions as above: reads with revenue:view, writes with settings:manage.
// The geo-options route is registered BEFORE /:id so it is not captured as an id.
router.get('/referral/campaigns', requirePerm('revenue:view'), asyncHandler(refCampaignCtrl.list));
router.get('/referral/campaigns-geo-options', requirePerm('revenue:view'), asyncHandler(refCampaignCtrl.geoOptions));
router.get('/referral/campaigns/:id', requirePerm('revenue:view'), asyncHandler(refCampaignCtrl.getOne));
router.post('/referral/campaigns', requirePerm('settings:manage'), validate(refCampaignSchema), asyncHandler(refCampaignCtrl.create));
router.put('/referral/campaigns/:id', requirePerm('settings:manage'), validate(refCampaignSchema), asyncHandler(refCampaignCtrl.update));
router.patch('/referral/campaigns/:id/status', requirePerm('settings:manage'), validate(refCampaignStatusSchema), asyncHandler(refCampaignCtrl.setStatus));
router.delete('/referral/campaigns/:id', requirePerm('settings:manage'), asyncHandler(refCampaignCtrl.remove));

// Role-based CSV exports. Each is gated by the permission for the data it emits,
// so a caller only downloads what their admin sub-role is allowed to see.
router.get('/exports/shops.csv', requirePerm('shops:view'), asyncHandler(exportCtrl.shopsCsv));
router.get('/exports/users.csv', requirePerm('users:view'), asyncHandler(exportCtrl.usersCsv));
router.get('/exports/moderation-log.csv', requirePerm('audit:view'), asyncHandler(exportCtrl.moderationLogCsv));
router.get('/exports/referrals.csv', requirePerm('revenue:view'), asyncHandler(exportCtrl.referralsCsv));
router.get('/exports/revenue.csv', requirePerm('revenue:view'), asyncHandler(exportCtrl.revenueCsv));

// Geo-targeted promo campaigns (ADS2). Reads gated with ads:view, writes with
// ads:manage (held by the marketing role, plus super via ALL). geo-options is
// registered BEFORE the :id routes so it is not captured as a campaign id.
router.get('/ads', requirePerm('ads:view'), asyncHandler(adsCtrl.list));
router.get('/ads/geo-options', requirePerm('ads:view'), asyncHandler(adsCtrl.geoOptions));
// Registered BEFORE /ads/:id so 'export.csv' is not captured as a campaign id.
router.get('/ads/export.csv', requirePerm('ads:view'), asyncHandler(adsCtrl.exportCsv));
router.get('/ads/:id', requirePerm('ads:view'), asyncHandler(adsCtrl.getOne));
router.post('/ads', requirePerm('ads:manage'), validate(campaignSchema), asyncHandler(adsCtrl.create));
router.put('/ads/:id', requirePerm('ads:manage'), validate(campaignSchema), asyncHandler(adsCtrl.update));
router.patch('/ads/:id/status', requirePerm('ads:manage'), validate(adStatusSchema), asyncHandler(adsCtrl.setStatus));
router.delete('/ads/:id', requirePerm('ads:manage'), asyncHandler(adsCtrl.remove));

// Shop self-serve promo moderation (batch PROMO-BUY). A shop buys a moderated
// promo that starts 'pending_review'; an admin approves it (→ active, it serves)
// or rejects it (→ rejected, credits refunded once). Same ads:manage perm as the
// campaign CRUD above.
router.get('/promos/pending', requirePerm('ads:manage'), asyncHandler(adsCtrl.pendingPromos));
router.post('/promos/:id/approve', requirePerm('ads:manage'), validate(promoReviewSchema), asyncHandler(adsCtrl.approvePromo));
router.post('/promos/:id/reject', requirePerm('ads:manage'), validate(promoReviewSchema), asyncHandler(adsCtrl.rejectPromo));

// Storefront photo moderation (batch STOREFRONT-FULL). An owner's storefront
// photo starts 'pending_review' (unless the shop is trusted) and only reaches
// the public storefront once approved here. Same ads:manage gate as the promo
// queue above (the same admin desk moderates both), same review_note body shape.
router.get('/shop-images/pending', requirePerm('ads:manage'), asyncHandler(adsCtrl.pendingShopImages));
router.post('/shop-images/:id/approve', requirePerm('ads:manage'), validate(promoReviewSchema), asyncHandler(adsCtrl.approveShopImage));
router.post('/shop-images/:id/reject', requirePerm('ads:manage'), validate(promoReviewSchema), asyncHandler(adsCtrl.rejectShopImage));
// Per-shop trust toggle: let a shop's uploads go live without review.
router.patch('/shops/:id/slides', requirePerm('ads:manage'), validate(shopSlidesSchema), asyncHandler(adsCtrl.setShopSlidesAutoPublish));

// AI moderation stats (batch AI-MOD): last-30-day counts of AI decisions and of
// admin decisions split by agreement with the AI. Same ads:manage gate as the
// two queues it describes.
router.get('/moderation/ai-stats', requirePerm('ads:manage'), asyncHandler(adsCtrl.aiStats));

module.exports = router;
