const router = require('express').Router();
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/admin.controller');

const updateShopSchema = Joi.object({
  status: Joi.string().valid('active', 'suspended'),
  plan: Joi.string().valid('free', 'pro', 'family'),
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
}).min(1);

router.use(auth('admin'));
router.get('/stats', asyncHandler(ctrl.stats));
router.get('/shops', asyncHandler(ctrl.listShops));
router.get('/shops/:id', asyncHandler(ctrl.getShop));
router.patch('/shops/:id', validate(updateShopSchema), asyncHandler(ctrl.updateShop));
router.get('/users', asyncHandler(ctrl.listUsers));
router.get('/settings', asyncHandler(ctrl.getSettings));
router.patch('/settings', validate(settingsSchema), asyncHandler(ctrl.updateSettings));
router.post('/settings/razorpay/test', asyncHandler(ctrl.testRazorpay));
router.post('/settings/whatsapp/test', validate(Joi.object({ to: Joi.string().required() })), asyncHandler(ctrl.testWhatsapp));

module.exports = router;
