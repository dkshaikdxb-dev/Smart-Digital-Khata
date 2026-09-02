const crypto = require('crypto');
const Razorpay = require('razorpay');

let client = null;
function getClient() {
  if (!client) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error('Razorpay keys are not configured');
    }
    client = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return client;
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

/** Razorpay plan IDs configured in the dashboard, mapped from our plan codes. */
function planIdFor(planCode) {
  const map = {
    pro: process.env.RAZORPAY_PLAN_PRO,
    family: process.env.RAZORPAY_PLAN_FAMILY,
  };
  return map[planCode] || null;
}

function isSubscriptionBillingConfigured(planCode) {
  return Boolean(
    process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_SECRET &&
    planIdFor(planCode)
  );
}

async function createSubscription({ plan_id, customer_notify = 1, total_count = 12, notes }) {
  return getClient().subscriptions.create({ plan_id, customer_notify, total_count, notes });
}

async function cancelSubscription(subscriptionId, cancelAtCycleEnd = false) {
  return getClient().subscriptions.cancel(subscriptionId, cancelAtCycleEnd);
}

function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader || ''));
  } catch {
    return false;
  }
}

module.exports = {
  createOrder,
  createPaymentLink,
  createSubscription,
  cancelSubscription,
  planIdFor,
  isSubscriptionBillingConfigured,
  verifyWebhookSignature,
};
