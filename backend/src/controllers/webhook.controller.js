const logger = require('../utils/logger');
const razorpay = require('../services/razorpay.service');
const whatsappInbound = require('../services/whatsapp-inbound.service');
const settings = require('../config/settings');
const { query, withTx } = require('../config/db');

async function alreadyProcessed(id, channel) {
  if (!id) return false;
  const key = `${channel}:${id}`;
  const r = await query(
    `INSERT INTO processed_events (id, channel) VALUES ($1, $2)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [key, channel]
  );
  return r.rowCount === 0;
}

const PAYMENT_EVENTS = ['payment.captured', 'order.paid', 'payment_link.paid'];

/**
 * Reconcile a Razorpay PAYMENT event against a local payment_orders row and
 * mark that row paid. Then, depending on what the payment settles:
 *   - payment_orders.order_id SET  → a PREPAID ORDER: mark the order paid (and
 *     advance a still-pending order to 'accepted'). Never touches the khata.
 *   - payment_orders.order_id NULL → a khata settlement (unchanged): insert the
 *     credit transaction and decrement the customer's balance.
 * Idempotent: an already-paid row is a no-op. Shared by the platform and
 * per-shop webhook handlers so both stay DRY.
 * @returns {boolean} true if a matching order was found (and reconciled/duplicate).
 */
async function reconcilePayment(event) {
  const p = event.payload.payment?.entity || {};
  const orderEntity = event.payload.order?.entity || {};
  const linkEntity = event.payload.payment_link?.entity || {};
  const orderId = p.order_id || orderEntity.id;
  const linkId = linkEntity.id || p.notes?.payment_link_id;
  const amount = p.amount || orderEntity.amount_paid || linkEntity.amount_paid || linkEntity.amount;

  const orderRes = await query(
    `SELECT * FROM payment_orders
     WHERE provider_order_id = $1
        OR provider_link_id = $2
        OR id = $3
     LIMIT 1`,
    [orderId || null, linkId || null, linkEntity.reference_id || null]
  );
  if (!orderRes.rowCount) {
    logger.warn({ orderId, linkId }, 'Razorpay webhook: no matching local order');
    return false;
  }
  const order = orderRes.rows[0];
  if (order.status === 'paid') return true;

  await withTx(async (client) => {
    await client.query(
      `UPDATE payment_orders SET status='paid', paid_at = NOW(), provider_payment_id = $1 WHERE id = $2`,
      [p.id || null, order.id]
    );
    if (order.order_id) {
      // Payment is a PREPAID ORDER settlement — mark the order paid (and move a
      // still-pending order to 'accepted'). The order was never on the khata,
      // so we must NOT insert a credit or touch the customer's balance.
      await client.query(
        `UPDATE orders
           SET payment_status = 'paid',
               status = CASE WHEN status = 'pending' THEN 'accepted' ELSE status END,
               updated_at = NOW()
         WHERE id = $1`,
        [order.order_id]
      );
    } else {
      // Khata settlement (unchanged): record the payment and reduce the balance.
      await client.query(
        `INSERT INTO transactions (shop_id, customer_id, type, amount, method, note, source)
         VALUES ($1,$2,'upi',$3,'razorpay',$4,'razorpay')`,
        [order.shop_id, order.customer_id, amount, `Razorpay ${orderId || linkId}`]
      );
      await client.query(
        `UPDATE customers SET balance = balance - $1, updated_at = NOW()
         WHERE id = $2 AND shop_id = $3`,
        [amount, order.customer_id, order.shop_id]
      );
    }
  });
  return true;
}

/**
 * PLATFORM webhook — POST /api/webhooks/razorpay.
 * Verified with the PLATFORM secret; handles ONLY subscription.* events now
 * (subscription billing stays on the platform Razorpay account). Per-shop
 * customer PAYMENT events arrive on the per-shop route below.
 */
exports.razorpay = async (req, res) => {
  const raw = req.body; // Buffer (raw parser)
  const sig = req.headers['x-razorpay-signature'];
  if (!razorpay.verifyWebhookSignature(raw, sig)) {
    logger.warn('Razorpay webhook: bad signature');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Malformed JSON' });
  }
  logger.info({ type: event.event, id: event.id }, 'Razorpay platform webhook received');

  if (await alreadyProcessed(event.id, 'razorpay')) {
    return res.json({ ok: true, duplicate: true });
  }

  if (event.event && event.event.startsWith('subscription.')) {
    await handleSubscriptionEvent(event);
  }

  res.json({ ok: true });
};

/**
 * PER-SHOP webhook — POST /api/webhooks/razorpay/shop/:token.
 * Resolves the shop from its RZP_WEBHOOK_TOKEN, verifies the body with THAT
 * shop's own webhook secret, then runs the shared payment reconciliation.
 * Dedupe is keyed per-token so two shops can't collide on Razorpay event ids.
 */
exports.razorpayShop = async (req, res) => {
  const { token } = req.params;
  const raw = req.body; // Buffer (raw parser)

  const shopRes = await query(
    `SELECT shop_id FROM shop_settings WHERE key = 'RZP_WEBHOOK_TOKEN' AND value = $1 LIMIT 1`,
    [token]
  );
  if (!shopRes.rowCount) {
    logger.warn({ token }, 'Razorpay shop webhook: unknown token');
    return res.status(404).json({ error: 'Unknown webhook token' });
  }
  const shopId = shopRes.rows[0].shop_id;

  const sig = req.headers['x-razorpay-signature'];
  if (!(await razorpay.verifyShopWebhook(shopId, raw, sig))) {
    logger.warn({ shopId }, 'Razorpay shop webhook: bad signature');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Malformed JSON' });
  }
  logger.info({ type: event.event, id: event.id, shopId }, 'Razorpay shop webhook received');

  // Dedupe keyed by token so the same event id from two shops stays distinct.
  if (await alreadyProcessed(event.id, `razorpay:${token}`)) {
    return res.json({ ok: true, duplicate: true });
  }

  if (PAYMENT_EVENTS.includes(event.event)) {
    await reconcilePayment(event);
  }

  res.json({ ok: true });
};

/**
 * Razorpay subscription lifecycle:
 *   subscription.activated → mark active, flip the shop's plan
 *   subscription.charged   → keep active (record renewal)
 *   subscription.halted / .cancelled / .completed / .expired → downgrade shop to free
 *   subscription.pending   → past_due (payment retrying)
 */
async function handleSubscriptionEvent(event) {
  const entity = event.payload?.subscription?.entity;
  if (!entity?.id) return;

  const local = await query(
    'SELECT * FROM subscriptions WHERE provider_subscription_id = $1',
    [entity.id]
  );
  if (!local.rowCount) {
    logger.warn({ sub: entity.id, type: event.event }, 'Subscription webhook: no local record');
    return;
  }
  const sub = local.rows[0];

  switch (event.event) {
    case 'subscription.activated':
    case 'subscription.charged':
      await withTx(async (client) => {
        await client.query(
          `UPDATE subscriptions SET status='active' WHERE id = $1`,
          [sub.id]
        );
        await client.query('UPDATE shops SET plan = $1 WHERE id = $2', [sub.plan, sub.shop_id]);
      });
      logger.info({ shop: sub.shop_id, plan: sub.plan, type: event.event }, 'Subscription active');
      break;

    case 'subscription.pending':
      await query(`UPDATE subscriptions SET status='past_due' WHERE id = $1`, [sub.id]);
      break;

    case 'subscription.halted':
    case 'subscription.cancelled':
    case 'subscription.completed':
    case 'subscription.expired':
      await withTx(async (client) => {
        await client.query(
          `UPDATE subscriptions
           SET status = CASE WHEN $2 = 'subscription.halted' THEN 'halted' ELSE 'cancelled' END,
               cancelled_at = COALESCE(cancelled_at, NOW())
           WHERE id = $1`,
          [sub.id, event.event]
        );
        await client.query(`UPDATE shops SET plan='free' WHERE id = $1`, [sub.shop_id]);
      });
      logger.info({ shop: sub.shop_id, type: event.event }, 'Subscription ended — shop downgraded to free');
      break;

    default:
      break;
  }
}

// Meta sends GET with hub.* params during webhook subscription
exports.whatsappVerify = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === settings.get('WHATSAPP_VERIFY_TOKEN')) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
};

exports.whatsappInbound = async (req, res) => {
  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Malformed JSON' });
  }
  // Respond immediately so Meta does not retry
  res.status(200).json({ ok: true });
  // Process async with dedupe at the message level
  whatsappInbound
    .handle(payload, { alreadyProcessed: (id) => alreadyProcessed(id, 'whatsapp') })
    .catch((err) => logger.error({ err: err.message }, 'WA inbound failed'));
};
