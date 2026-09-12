// The repeating new-order WhatsApp re-send (batch ORDERALERT).
//
// This is the channel that works with NO app change at all: a locked phone in a
// pocket still buzzes for a WhatsApp message, so an order that the owner has not
// acknowledged gets re-sent on the shop's own cadence until they acknowledge it
// or the repeat cap is reached.
//
// Like weekly-summary.service, the iteration lives HERE and not in the BullMQ
// wiring (src/jobs/index.js), so runTick() is Redis-free and unit-testable: a
// test calls it straight with a stubbed `send`. It requires only config/db, the
// WhatsApp seam, the shared "needs alerting" predicate and the pure copy helper.
//
// SAFETY PROPERTIES the tests pin down:
//   - The candidate SELECT is only a hint. Every order is re-locked FOR UPDATE
//     and the whole condition is re-checked inside the transaction, so an
//     acknowledgement (or a mute, or a disable) that lands between the select and
//     the update ALWAYS wins and no message goes out.
//   - The counter is committed BEFORE the message is sent, and the send is
//     fire-and-forget with every error swallowed and logged. A WhatsApp outage
//     therefore can never fail the tick and can never roll the counter back —
//     which matters, because a rollback would turn an outage into an infinite
//     retry storm against the same shop.
//   - A per-tick cap keeps one pathological shop from stalling the minute tick.

const { query, withTx } = require('../config/db');
const whatsapp = require('./whatsapp.service');
const logger = require('../utils/logger');
const { needsAlertingSql, needsAlerting } = require('../utils/orderAlerts');
const { buildOwnerAlert, resolveLang } = require('../utils/order-alert-copy');

// Hard ceiling on how many orders one tick will alert. The tick runs every
// minute, so a backlog simply drains over the following ticks (oldest first).
const DEFAULT_LIMIT = 200;

// The owner's language for the WhatsApp alert. There is NO per-shop/owner
// language column in this schema today (verified against every migration), so
// this resolves to the copy helper's English fallback. It reads `shop.language`
// defensively so a future migration that adds the column needs no change here —
// the same forward-compatible shape weekly-summary.service uses.
function ownerLang(shop) {
  return resolveLang(shop && shop.language);
}

// The shop OWNER's phone, exactly as my.controller.resolveOwnerContact resolves
// it: the users row with role='owner' scoped to this shop, else the shop's
// owner_id user. Scalar subqueries (not joins) so a shop with two owner rows can
// never duplicate the candidate order.
const OWNER_PHONE_SQL = `
  COALESCE(
    (SELECT u.phone FROM users u
      WHERE u.shop_id = s.id AND u.role = 'owner' AND u.phone IS NOT NULL
      ORDER BY u.created_at ASC LIMIT 1),
    (SELECT u2.phone FROM users u2 WHERE u2.id = s.owner_id)
  )`;

/**
 * Candidate orders for this tick, oldest first. One query, no per-shop fan-out:
 *   - the order still needs alerting (the ONE shared predicate),
 *   - the shop has order alerts on and is not muted right now,
 *   - the repeat cap has not been reached,
 *   - and enough time has passed since the last alert (or since the order was
 *     placed, for the very first repeat).
 * Everything it returns is re-checked under a row lock before anything is sent.
 */
async function selectCandidates(limit) {
  const r = await query(
    `SELECT o.id,
            o.shop_id,
            o.status,
            o.acknowledged_at,
            o.alert_count,
            o.created_at,
            o.fulfillment_type,
            o.payment_mode,
            o.address,
            o.note,
            (o.subtotal + o.delivery_fee) AS total,
            EXTRACT(EPOCH FROM (NOW() - o.created_at))::int AS age_seconds,
            (SELECT COUNT(*)::int FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
            c.name AS customer_name,
            s.name AS shop_name,
            s.order_alert_max_repeats,
            s.order_alert_repeat_minutes,
            ${OWNER_PHONE_SQL} AS owner_phone
       FROM orders o
       JOIN shops s ON s.id = o.shop_id
       JOIN customers c ON c.id = o.customer_id
      WHERE ${needsAlertingSql('o')}
        AND s.order_alert_enabled = true
        AND (s.order_alert_muted_until IS NULL OR s.order_alert_muted_until < NOW())
        AND o.alert_count < s.order_alert_max_repeats
        AND NOW() - COALESCE(o.last_alert_at, o.created_at)
            >= s.order_alert_repeat_minutes * interval '1 minute'
      ORDER BY o.created_at ASC
      LIMIT $1`,
    [limit]
  );
  return r.rows;
}

/**
 * Claim ONE candidate: re-lock the order, re-check the whole condition against
 * live rows, and bump the counter. Returns the payload to send, or null when the
 * order no longer qualifies (acknowledged, accepted, cancelled, muted, disabled,
 * capped, or already alerted by a concurrent tick).
 *
 * The bump and the re-check are in the SAME transaction under FOR UPDATE, so two
 * overlapping ticks can never both send, and an owner acknowledging mid-flight
 * always wins: their UPDATE either lands before ours (we see acknowledged_at and
 * skip) or waits on our lock and then silences every FUTURE repeat.
 */
async function claimOrder(orderId) {
  return withTx(async (client) => {
    const r = await client.query(
      `SELECT o.id,
              o.shop_id,
              o.status,
              o.acknowledged_at,
              o.alert_count,
              o.last_alert_at,
              o.created_at,
              o.fulfillment_type,
              o.payment_mode,
              o.address,
              o.note,
              (o.subtotal + o.delivery_fee) AS total,
              EXTRACT(EPOCH FROM (NOW() - o.created_at))::int AS age_seconds,
              (SELECT COUNT(*)::int FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
              (NOW() - COALESCE(o.last_alert_at, o.created_at)
                 >= s.order_alert_repeat_minutes * interval '1 minute') AS due,
              c.name AS customer_name,
              s.name AS shop_name,
              s.order_alert_enabled,
              s.order_alert_muted_until,
              s.order_alert_max_repeats,
              ${OWNER_PHONE_SQL} AS owner_phone
         FROM orders o
         JOIN shops s ON s.id = o.shop_id
         JOIN customers c ON c.id = o.customer_id
        WHERE o.id = $1
        FOR UPDATE OF o`,
      [orderId]
    );
    if (!r.rowCount) return null;
    const row = r.rows[0];

    // THE RE-CHECK. An ack that landed between the select and this lock wins.
    if (!needsAlerting(row)) return null;
    if (row.order_alert_enabled === false) return null;
    if (row.order_alert_muted_until && new Date(row.order_alert_muted_until) > new Date()) return null;
    if (Number(row.alert_count) >= Number(row.order_alert_max_repeats)) return null;
    if (!row.due) return null;
    if (!row.owner_phone) return null;

    const upd = await client.query(
      `UPDATE orders
          SET alert_count = alert_count + 1,
              last_alert_at = NOW()
        WHERE id = $1
        RETURNING alert_count`,
      [orderId]
    );
    const n = Number(upd.rows[0].alert_count);

    const lang = ownerLang(row);
    return {
      phone: row.owner_phone,
      orderId: row.id,
      shopId: row.shop_id,
      n,
      message: buildOwnerAlert({
        lang,
        shopName: row.shop_name,
        customerName: row.customer_name,
        itemCount: row.item_count,
        total: row.total,
        fulfillmentType: row.fulfillment_type,
        paymentMode: row.payment_mode,
        address: row.address,
        note: row.note,
        repeat: {
          n,
          max: Number(row.order_alert_max_repeats),
          ageSeconds: row.age_seconds,
        },
      }),
    };
  });
}

/**
 * One tick of the repeating alert. Redis-free and directly callable from a test.
 *
 * @param {object} [opts]
 * @param {number} [opts.limit]  max orders to alert in this tick
 * @param {function} [opts.send] injectable WhatsApp send (phone, text) — defaults
 *                               to the real seam; a test passes a stub so CI
 *                               never touches the network
 * @returns {Promise<{candidates:number, alerted:number, skipped:number, failed:number}>}
 */
async function runTick(opts = {}) {
  const limit = Number.isFinite(Number(opts.limit)) && Number(opts.limit) > 0
    ? Math.floor(Number(opts.limit))
    : DEFAULT_LIMIT;
  const send = typeof opts.send === 'function'
    ? opts.send
    : (phone, text) => whatsapp.sendText(phone, text);

  let candidates = [];
  try {
    candidates = await selectCandidates(limit);
  } catch (err) {
    // A failed SELECT is the only thing that can end the tick early; log and
    // return a zero result rather than throwing into the worker.
    logger.error({ err: err.message }, 'order-alert tick: candidate select failed');
    return { candidates: 0, alerted: 0, skipped: 0, failed: 0 };
  }

  let alerted = 0;
  let skipped = 0;
  let failed = 0;

  for (const cand of candidates) {
    let claim = null;
    try {
      claim = await claimOrder(cand.id);
    } catch (err) {
      // A lock/DB error on ONE order must not abort the whole tick.
      failed += 1;
      logger.error({ err: err.message, order_id: cand.id }, 'order-alert tick: claim failed');
      continue;
    }
    if (!claim) { skipped += 1; continue; }

    // COMMITTED counter, THEN the send. Awaited only so the tick does not leave
    // dangling promises; every failure is swallowed here and the counter stays
    // bumped — a WhatsApp outage must never fail the tick or roll it back.
    try {
      await send(claim.phone, claim.message);
      alerted += 1;
    } catch (err) {
      alerted += 1; // the alert was CLAIMED; delivery is best-effort, like every
      // other WhatsApp path in this codebase.
      logger.warn(
        { err: err.message, order_id: claim.orderId, attempt: claim.n },
        'order-alert tick: WhatsApp send failed (counter stays bumped)'
      );
    }
  }

  if (candidates.length) {
    logger.info({ candidates: candidates.length, alerted, skipped, failed }, 'order-alert tick');
  }
  return { candidates: candidates.length, alerted, skipped, failed };
}

module.exports = { runTick, selectCandidates, claimOrder, ownerLang, DEFAULT_LIMIT };
