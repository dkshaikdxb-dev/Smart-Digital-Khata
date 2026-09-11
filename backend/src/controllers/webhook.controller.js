const logger = require('../utils/logger');
const razorpay = require('../services/razorpay.service');
const whatsappInbound = require('../services/whatsapp-inbound.service');
const settings = require('../config/settings');
const { query, withTx } = require('../config/db');
const { maybeActivateReferral } = require('../utils/referral');

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

/**
 * Best-effort UNMARK of a just-inserted processed_events row. Used when the
 * handler that runs AFTER `alreadyProcessed` returned false (a freshly inserted
 * key) throws before it durably settled the event — so the provider's retry is
 * allowed to re-deliver and reconcile instead of being deduped away and lost.
 * Never throws (a failed delete only means a retry is deduped; the reconcile is
 * idempotent so nothing is double-applied).
 */
async function unmarkProcessed(id, channel) {
  if (!id) return;
  const key = `${channel}:${id}`;
  try {
    await query(`DELETE FROM processed_events WHERE id = $1`, [key]);
  } catch (err) {
    logger.error({ err: err.message, key }, 'Failed to unmark processed event');
  }
}

const PAYMENT_EVENTS = ['payment.captured', 'order.paid', 'payment_link.paid'];

/**
 * Reconcile a Razorpay PAYMENT event against a local payment_orders row and
 * mark that row paid. Then, depending on what the payment settles:
 *   - payment_orders.order_id SET  → a PREPAID ORDER: mark the order paid (and
 *     advance a still-pending order to 'accepted'). Never touches the khata.
 *   - payment_orders.order_id NULL → a khata settlement (unchanged): insert the
 *     credit transaction and decrement the customer's balance.
 * Idempotent: the paid-transition is an atomic conditional UPDATE, so duplicate
 * deliveries of the SAME payment (different Razorpay event ids for
 * payment.captured / order.paid / payment_link.paid) settle EXACTLY ONCE — the
 * balance is never double-decremented. Shared by the platform and per-shop
 * webhook handlers so both stay DRY.
 * @param {object} event  the parsed Razorpay webhook event
 * @param {string|null} shopId  the resolved shop (per-shop handler) — when
 *   present the match is additionally scoped by shop_id so a cross-shop
 *   reconciliation is impossible by construction. The platform handler has no
 *   shop, so the argument is optional.
 * @returns {boolean} true if a matching order was found (and reconciled/duplicate).
 */
async function reconcilePayment(event, shopId = null) {
  const p = event.payload.payment?.entity || {};
  const orderEntity = event.payload.order?.entity || {};
  const linkEntity = event.payload.payment_link?.entity || {};
  const orderId = p.order_id || orderEntity.id;
  const linkId = linkEntity.id || p.notes?.payment_link_id;
  const eventAmount = p.amount || orderEntity.amount_paid || linkEntity.amount_paid || linkEntity.amount;

  // Defense-in-depth (scope the match by shop when the caller knows it).
  const params = [orderId || null, linkId || null, linkEntity.reference_id || null];
  let shopClause = '';
  if (shopId != null) {
    params.push(shopId);
    shopClause = ` AND shop_id = $${params.length}`;
  }
  const orderRes = await query(
    `SELECT * FROM payment_orders
     WHERE (provider_order_id = $1
        OR provider_link_id = $2
        OR id = $3)${shopClause}
     LIMIT 1`,
    params
  );
  if (!orderRes.rowCount) {
    logger.warn({ orderId, linkId, shopId }, 'Razorpay webhook: no matching local order');
    return false;
  }
  const order = orderRes.rows[0];
  // Fast-path optimization for an already-paid row read OUTSIDE the tx. The
  // AUTHORITATIVE idempotency guard is the conditional UPDATE below.
  if (order.status === 'paid') return true;

  // Never write NULL/garbage into the BIGINT amount column: default to the
  // locally recorded order amount. If both are present but differ, trust the
  // amount WE created the order for and warn (a mismatched webhook amount must
  // not silently move the wrong sum).
  let amount = eventAmount ?? order.amount;
  if (eventAmount != null && order.amount != null && Number(eventAmount) !== Number(order.amount)) {
    logger.warn(
      { orderId, linkId, eventAmount, orderAmount: order.amount },
      'Razorpay webhook: amount mismatch — using local order amount'
    );
    amount = order.amount;
  }

  // Did THIS delivery flip the row to paid? Only the winner runs side effects.
  let settled = false;
  await withTx(async (client) => {
    const upd = await client.query(
      `UPDATE payment_orders SET status='paid', paid_at = NOW(), provider_payment_id = $1
       WHERE id = $2 AND status <> 'paid'`,
      [p.id || null, order.id]
    );
    if (upd.rowCount !== 1) {
      // Another delivery already settled this order inside its own tx →
      // idempotent no-op. Do NOT re-apply any side effect.
      return;
    }
    settled = true;

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

  // A khata settlement records a `upi` collection for the shop — activate its
  // referral on the first one. AFTER the commit; only when THIS call performed a
  // real khata settlement (settled && !order.order_id). Swallows its own errors.
  if (settled && !order.order_id) {
    await maybeActivateReferral(order.shop_id);
  }
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
    try {
      await handleSubscriptionEvent(event);
    } catch (err) {
      // Reconciliation failed after we marked the event processed — unmark it so
      // Razorpay's retry re-delivers instead of getting deduped and dropped.
      await unmarkProcessed(event.id, 'razorpay');
      throw err;
    }
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
    try {
      await reconcilePayment(event, shopId);
    } catch (err) {
      // A transient reconcile failure must NOT permanently drop the payment:
      // unmark the event so Razorpay's retry reconciles it. Fix 1 makes the
      // reconcile idempotent, so a retry after a crash that DID commit is a
      // safe no-op.
      await unmarkProcessed(event.id, `razorpay:${token}`);
      throw err;
    }
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
