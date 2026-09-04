const crypto = require('crypto');
const Razorpay = require('razorpay');
const settings = require('../config/settings');
const shopSettings = require('../config/shopSettings');

/** Constant-time HMAC-SHA256 hex compare used by both webhook verifiers. */
function verifyHmac(rawBody, signatureHeader, secret) {
  if (!secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader || ''));
  } catch {
    return false;
  }
}

// Build a fresh client from current settings each call (cheap — no network).
function getClient() {
  const key_id = settings.get('RAZORPAY_KEY_ID');
  const key_secret = settings.get('RAZORPAY_KEY_SECRET');
  if (!key_id || !key_secret) {
    throw new Error('Razorpay keys are not configured');
  }
  return new Razorpay({ key_id, key_secret });
}

function keyId() {
  return settings.get('RAZORPAY_KEY_ID');
}

function isConfigured() {
  return Boolean(settings.get('RAZORPAY_KEY_ID') && settings.get('RAZORPAY_KEY_SECRET'));
}

async function createOrder({ amount, receipt, notes }) {
  return getClient().orders.create({
    amount,
    currency: 'INR',
    receipt,
    notes,
    payment_capture: 1,
  });
}

/**
 * Razorpay hosted Payment Link — customer-facing URL we can share over WhatsApp.
 * https://razorpay.com/docs/api/payments/payment-links/standard/
 */
async function createPaymentLink({ amount, description, customer, notes, reference_id, callback_url }) {
  return getClient().paymentLink.create({
    amount,
    currency: 'INR',
    accept_partial: false,
    description,
    customer,
    notify: { sms: true, email: false },
    reminder_enable: true,
    notes,
    reference_id,
    callback_url,
    callback_method: 'get',
  });
}

/** Razorpay plan IDs (from settings), mapped from our plan codes. */
function planIdFor(planCode) {
  const map = {
    pro: settings.get('RAZORPAY_PLAN_PRO'),
    family: settings.get('RAZORPAY_PLAN_FAMILY'),
  };
  return map[planCode] || null;
}

function isSubscriptionBillingConfigured(planCode) {
  return Boolean(isConfigured() && planIdFor(planCode));
}

async function createSubscription({ plan_id, customer_notify = 1, total_count = 12, notes }) {
  return getClient().subscriptions.create({ plan_id, customer_notify, total_count, notes });
}

async function cancelSubscription(subscriptionId, cancelAtCycleEnd = false) {
  return getClient().subscriptions.cancel(subscriptionId, cancelAtCycleEnd);
}

function verifyWebhookSignature(rawBody, signatureHeader) {
  return verifyHmac(rawBody, signatureHeader, settings.get('RAZORPAY_WEBHOOK_SECRET'));
}

/** Lightweight auth check for the "Test connection" button. */
async function testConnection() {
  await getClient().orders.all({ count: 1 });
  return true;
}

// ---------------------------------------------------------------------------
// Per-shop Razorpay — each shop connects THEIR OWN account so customer payments
// settle directly to that shop. The platform functions above remain ONLY for
// subscription billing (Pro/Family).
// ---------------------------------------------------------------------------

/** Build a fresh client from this shop's stored keys (cheap — no network). */
async function clientForShop(shopId) {
  const { key_id, key_secret } = await shopSettings.getRazorpay(shopId);
  if (!key_id || !key_secret) {
    throw new Error('Shop Razorpay not configured');
  }
  return new Razorpay({ key_id, key_secret });
}

async function isConfiguredForShop(shopId) {
  const { key_id, key_secret } = await shopSettings.getRazorpay(shopId);
  return Boolean(key_id && key_secret);
}

async function keyIdForShop(shopId) {
  const { key_id } = await shopSettings.getRazorpay(shopId);
  return key_id;
}

async function createOrderForShop(shopId, { amount, receipt, notes }) {
  const client = await clientForShop(shopId);
  return client.orders.create({
    amount,
    currency: 'INR',
    receipt,
    notes,
    payment_capture: 1,
  });
}

async function createPaymentLinkForShop(shopId, { amount, description, customer, notes, reference_id, callback_url }) {
  const client = await clientForShop(shopId);
  return client.paymentLink.create({
    amount,
    currency: 'INR',
    accept_partial: false,
    description,
    customer,
    notify: { sms: true, email: false },
    reminder_enable: true,
    notes,
    reference_id,
    callback_url,
    callback_method: 'get',
  });
}

/** "Test connection" for a shop's own keys. */
async function testConnectionForShop(shopId) {
  const client = await clientForShop(shopId);
  await client.orders.all({ count: 1 });
  return true;
}

/** Verify a webhook body against THIS shop's own webhook secret. */
async function verifyShopWebhook(shopId, rawBody, signatureHeader) {
  const { webhook_secret } = await shopSettings.getRazorpay(shopId);
  return verifyHmac(rawBody, signatureHeader, webhook_secret);
}

module.exports = {
  createOrder,
  createPaymentLink,
  createSubscription,
  cancelSubscription,
  planIdFor,
  keyId,
  isConfigured,
  isSubscriptionBillingConfigured,
  verifyWebhookSignature,
  testConnection,
  // per-shop
  clientForShop,
  isConfiguredForShop,
  keyIdForShop,
  createOrderForShop,
  createPaymentLinkForShop,
  testConnectionForShop,
  verifyShopWebhook,
};
