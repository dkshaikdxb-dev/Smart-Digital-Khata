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
  logger.info({ type: event.event, id: event.id }, 'Razorpay webhook received');

  if (await alreadyProcessed(event.id, 'razorpay')) {
    return res.json({ ok: true, duplicate: true });
  }

  if (event.event === 'payment.captured' || event.event === 'order.paid' || event.event === 'payment_link.paid') {
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
    if (orderRes.rowCount) {
      const order = orderRes.rows[0];
      if (order.status === 'paid') return res.json({ ok: true, duplicate: true });

      await withTx(async (client) => {
        await client.query(
          `UPDATE payment_orders SET status='paid', paid_at = NOW(), provider_payment_id = $1 WHERE id = $2`,
          [p.id || null, order.id]
        );
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
      });
    } else {
      logger.warn({ orderId, linkId }, 'Razorpay webhook: no matching local order');
    }
  }

  if (event.event && event.event.startsWith('subscription.')) {
    await handleSubscriptionEvent(event);
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
