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

async function createSubscription({ plan_id, customer_notify = 1, total_count = 12, notes }) {
  return getClient().subscriptions.create({ plan_id, customer_notify, total_count, notes });
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

module.exports = { createOrder, createSubscription, verifyWebhookSignature };
