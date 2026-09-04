const crypto = require('crypto');
const shopSettings = require('../config/shopSettings');
const razorpay = require('../services/razorpay.service');

// Razorpay test keys are prefixed rzp_test_, live keys rzp_live_.
function modeFor(keyId) {
  if (!keyId) return null;
  if (keyId.startsWith('rzp_live_')) return 'live';
  if (keyId.startsWith('rzp_test_')) return 'test';
  return null;
}

function webhookUrl(token) {
  return `${process.env.APP_URL || ''}/api/webhooks/razorpay/shop/${token}`;
}

/** Return the shop's token, generating + persisting one on first access. */
async function ensureToken(shopId, existing) {
  if (existing) return existing;
  const token = crypto.randomBytes(16).toString('hex'); // 32 hex chars
  await shopSettings.setMany(shopId, { RZP_WEBHOOK_TOKEN: token });
  return token;
}

/**
 * GET /api/shops/me/payment — the shop's Razorpay connection status.
 * Never returns secrets; only whether each is set. Generates the webhook token
 * on first access so the owner always has a URL to paste into Razorpay.
 */
exports.get = async (req, res) => {
  const shopId = req.user.shopId;
  const s = await shopSettings.getRazorpay(shopId);
  const token = await ensureToken(shopId, s.webhook_token);

  res.json({
    key_id: s.key_id || null,
    mode: modeFor(s.key_id),
    key_secret_set: Boolean(s.key_secret),
    webhook_secret_set: Boolean(s.webhook_secret),
    webhook_url: webhookUrl(token),
  });
};

/**
 * PATCH /api/shops/me/payment — set the shop's Razorpay credentials.
 * key_id is a passthrough; secrets are only overwritten when a non-empty value
 * is provided (so a blank field never wipes a stored secret). Auto-generates
 * the webhook token if absent. Never returns secrets.
 */
exports.update = async (req, res) => {
  const shopId = req.user.shopId;
  const { razorpay_key_id, razorpay_key_secret, razorpay_webhook_secret } = req.body;

  const toSet = {};
  if (razorpay_key_id !== undefined) toSet.RZP_KEY_ID = razorpay_key_id;
  if (razorpay_key_secret) toSet.RZP_KEY_SECRET = razorpay_key_secret;
  if (razorpay_webhook_secret) toSet.RZP_WEBHOOK_SECRET = razorpay_webhook_secret;
  if (Object.keys(toSet).length) await shopSettings.setMany(shopId, toSet);

  const s = await shopSettings.getRazorpay(shopId);
  const token = await ensureToken(shopId, s.webhook_token);

  res.json({
    key_id: s.key_id || null,
    mode: modeFor(s.key_id),
    key_secret_set: Boolean(s.key_secret),
    webhook_secret_set: Boolean(s.webhook_secret),
    webhook_url: webhookUrl(token),
  });
};

/**
 * POST /api/shops/me/payment/test — verify the stored keys against Razorpay.
 */
exports.test = async (req, res) => {
  const shopId = req.user.shopId;
  if (!(await razorpay.isConfiguredForShop(shopId))) {
    return res.json({ ok: false, message: 'This shop has not connected Razorpay yet.' });
  }
  try {
    await razorpay.testConnectionForShop(shopId);
    res.json({ ok: true, message: 'Razorpay connection OK' });
  } catch (err) {
    res.json({ ok: false, message: err.error?.description || err.message || 'Connection failed' });
  }
};
