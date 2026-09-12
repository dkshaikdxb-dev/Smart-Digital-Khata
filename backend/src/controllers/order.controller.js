const { query, withTx } = require('../config/db');
const ApiError = require('../utils/ApiError');
const whatsapp = require('../services/whatsapp.service');
const { renderLang, withCustomerNameLocal } = require('../utils/name-local');
// The ONE shared "this order still needs alerting" definition (batch ORDERALERT).
const { needsAlertingSql } = require('../utils/orderAlerts');

// Owner/staff order management, scoped to req.user.shopId. A shop only ever
// sees and mutates its OWN orders.

// Linear status pipeline. A "forward move" is any status with a strictly higher
// rank; 'cancelled' is a valid move from any non-terminal status. Anything else
// (backward, same, or unknown) is a nonsense transition.
// Who acknowledged an order. `orders.acknowledged_by` is a UUID FK to users, but
// a token `sub` is not guaranteed to be a real user row (service tokens, and the
// synthetic subs the integration tests sign), so we only ever pass a well-formed
// UUID and resolve it through a `SELECT id FROM users` subquery — an unknown id
// simply stores NULL instead of failing the owner's status change.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function actorId(req) {
  const sub = req.user && req.user.sub;
  return UUID_RE.test(String(sub == null ? '' : sub)) ? sub : null;
}

const STATUS_RANK = {
  pending: 0,
  accepted: 1,
  preparing: 2,
  ready: 3,
  out_for_delivery: 4,
  completed: 5,
};
const TERMINAL = new Set(['completed', 'cancelled']);

/**
 * GET /orders?status=&lang= — this shop's orders (optional status filter),
 * newest first, with the customer's name/phone and an item count. When ?lang=
 * is a render language each row also carries `customer_name_local` (the same
 * rendering /customers exposes as name_local); otherwise the key is absent.
 */
exports.list = async (req, res) => {
  const lang = renderLang(req.query.lang);
  const params = [req.user.shopId];
  let where = 'o.shop_id = $1';
  if (req.query.status) {
    params.push(req.query.status);
    where += ` AND o.status = $${params.length}`;
  }
  const r = await query(
    `SELECT o.*, (o.subtotal + o.delivery_fee) AS total,
            c.name AS customer_name, c.phone AS customer_phone,
            COUNT(oi.id)::int AS item_count
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE ${where}
     GROUP BY o.id, c.name, c.phone
     ORDER BY o.created_at DESC`,
    params
  );
  const items = lang ? r.rows.map((row) => withCustomerNameLocal(row, lang)) : r.rows;
  res.json({ items });
};

/**
 * GET /orders/:id?lang= — full detail (items + customer). 404 if not this
 * shop's. `customer_name_local` is attached under the same ?lang= rule as list.
 */
exports.get = async (req, res) => {
  const lang = renderLang(req.query.lang);
  const r = await query(
    `SELECT o.*, (o.subtotal + o.delivery_fee) AS total,
            c.name AS customer_name, c.phone AS customer_phone
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     WHERE o.id = $1 AND o.shop_id = $2`,
    [req.params.id, req.user.shopId]
  );
  if (!r.rowCount) throw ApiError.notFound('Order not found');

  const items = await query(
    `SELECT id, product_id, name, unit_price, quantity, line_total, weight_grams
     FROM order_items WHERE order_id = $1 ORDER BY name ASC`,
    [req.params.id]
  );
  res.json({ order: { ...withCustomerNameLocal(r.rows[0], lang), items: items.rows } });
};

/**
 * PATCH /orders/:id/status { status } — advance the order.
 *  - A completed/cancelled order is terminal → 409.
 *  - Only a strictly-forward move or 'cancelled' is allowed → else 422.
 * On success the customer is notified over WhatsApp (respecting
 * notifications_enabled), fire-and-forget.
 */
exports.updateStatus = async (req, res) => {
  const { status: next } = req.body;

  const result = await withTx(async (client) => {
    const r = await client.query(
      `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone,
              c.notifications_enabled, s.name AS shop_name
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       JOIN shops s ON s.id = o.shop_id
       WHERE o.id = $1 AND o.shop_id = $2
       FOR UPDATE OF o`,
      [req.params.id, req.user.shopId]
    );
    if (!r.rowCount) throw ApiError.notFound('Order not found');
    const order = r.rows[0];

    if (TERMINAL.has(order.status)) {
      throw ApiError.conflict('Cannot modify a completed or cancelled order');
    }

    const forward = next === 'cancelled' || STATUS_RANK[next] > STATUS_RANK[order.status];
    if (!forward) {
      throw ApiError.unprocessable('Invalid status transition', {
        from: order.status,
        to: next,
      });
    }

    // A CASH order is settled on hand-over: completing it means the owner has
    // collected the cash, so flip payment_status pending -> paid. Credit and
    // prepaid payment_status is untouched here (khata / Razorpay own those).
    const collectCash = order.payment_mode === 'cash' && next === 'completed';
    // Acknowledging the new-order alert is IMPLICIT (batch ORDERALERT): any move
    // out of 'pending' means the owner has plainly seen the order, so the SAME
    // update stamps acknowledged_at/by. Accepting silences the nagging with no
    // extra tap; so does cancelling. COALESCE keeps an earlier explicit "Seen"
    // timestamp — the first acknowledgement is the one that counts.
    const upd = await client.query(
      `UPDATE orders
          SET status = $1,
              payment_status = CASE WHEN $3 THEN 'paid' ELSE payment_status END,
              acknowledged_at = COALESCE(acknowledged_at, NOW()),
              acknowledged_by = COALESCE(acknowledged_by, (SELECT u.id FROM users u WHERE u.id = $4)),
              updated_at = NOW()
        WHERE id = $2
        RETURNING *`,
      [next, order.id, collectCash, actorId(req)]
    );
    return {
      order: upd.rows[0],
      customer: {
        name: order.customer_name,
        phone: order.customer_phone,
        notifications_enabled: order.notifications_enabled,
      },
      shopName: order.shop_name,
    };
  });

  if (result.customer.notifications_enabled !== false) {
    whatsapp
      .sendText(
        result.customer.phone,
        `Hi ${result.customer.name}, your order at ${result.shopName} is now ${result.order.status}.`
      )
      .catch(() => {});
  }

  res.json({ order: result.order });
};

// ===========================================================================
// Repeating new-order alert (batch ORDERALERT). A new order keeps nagging the
// owner — web banner, native banner, WhatsApp re-send — until it is
// ACKNOWLEDGED. These three endpoints are the owner's side of that loop: "what
// is still waiting", "I have seen this one", and "quiet for a while". All three
// are owner/staff and shop-scoped, like the rest of this controller.
// ===========================================================================

// Mute window bounds, in minutes. 1 minute is the smallest useful pause; 12
// hours is a whole trading day, beyond which "muted" would quietly become "off"
// and the owner would stop seeing orders without ever choosing that.
const MUTE_MIN_MINUTES = 1;
const MUTE_MAX_MINUTES = 720;

/**
 * POST /orders/:id/ack — "I have seen it". Sets acknowledged_at/by ONLY while
 * they are still NULL, so the endpoint is idempotent: a second call (a double
 * tap, a retry over a flaky 2G link, the web banner and the app racing) returns
 * 200 with the SAME timestamp and never moves it.
 *
 * It deliberately does NOT change the status — the owner is saying "I have seen
 * it", not "I accept it". Accepting is a separate, explicit decision (and it
 * acknowledges implicitly; see updateStatus).
 *
 * 404 when the order is not this shop's — never a 403, so probing another
 * shop's ids reveals nothing.
 */
exports.ack = async (req, res) => {
  const r = await query(
    `UPDATE orders
        SET acknowledged_at = COALESCE(acknowledged_at, NOW()),
            acknowledged_by = COALESCE(acknowledged_by, (SELECT u.id FROM users u WHERE u.id = $3))
      WHERE id = $1 AND shop_id = $2
      RETURNING id, acknowledged_at`,
    [req.params.id, req.user.shopId, actorId(req)]
  );
  if (!r.rowCount) throw ApiError.notFound('Order not found');
  res.json({ id: r.rows[0].id, acknowledged_at: r.rows[0].acknowledged_at });
};

/**
 * GET /orders/alerts?lang= — everything still waiting for this shop, OLDEST
 * FIRST, plus the shop's alert settings in the SAME response so a client needs
 * ONE request per poll, not two.
 *
 * The payload is deliberately SMALL (these clients are on 2G): just the facts a
 * banner needs, and no line items. `customer_name_local` is attached under the
 * same ?lang= rule as list/get.
 */
exports.alerts = async (req, res) => {
  const lang = renderLang(req.query.lang);

  const shopRes = await query(
    `SELECT order_alert_enabled, order_alert_repeat_minutes,
            order_alert_max_repeats, order_alert_muted_until
       FROM shops WHERE id = $1`,
    [req.user.shopId]
  );
  if (!shopRes.rowCount) throw ApiError.notFound('Shop not found');
  const s = shopRes.rows[0];

  const r = await query(
    `SELECT o.id,
            c.name AS customer_name,
            (SELECT COUNT(*)::int FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
            (o.subtotal + o.delivery_fee) AS total,
            o.fulfillment_type,
            o.payment_mode,
            o.created_at,
            o.alert_count,
            EXTRACT(EPOCH FROM (NOW() - o.created_at))::int AS age_seconds
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
      WHERE o.shop_id = $1 AND ${needsAlertingSql('o')}
      ORDER BY o.created_at ASC`,
    [req.user.shopId]
  );

  res.json({
    items: lang ? r.rows.map((row) => withCustomerNameLocal(row, lang)) : r.rows,
    alert: {
      enabled: s.order_alert_enabled !== false,
      repeat_minutes: Number(s.order_alert_repeat_minutes),
      max_repeats: Number(s.order_alert_max_repeats),
      muted_until: s.order_alert_muted_until,
    },
  });
};

/**
 * POST /orders/alerts/mute { minutes } — "turn it off for now". Sets
 * shops.order_alert_muted_until = NOW() + minutes (clamped to 1..720); `0`
 * clears the mute immediately.
 *
 * This is the ONE switch that silences BOTH the app banners and the WhatsApp
 * re-send, so an owner in the middle of a rush has a single honest way to stop
 * the noise without turning the feature off for good.
 */
exports.mute = async (req, res) => {
  const raw = parseInt(req.body.minutes, 10);
  const minutes = Number.isFinite(raw) ? raw : 0;

  if (minutes <= 0) {
    const cleared = await query(
      `UPDATE shops SET order_alert_muted_until = NULL, updated_at = NOW()
        WHERE id = $1 RETURNING order_alert_muted_until`,
      [req.user.shopId]
    );
    if (!cleared.rowCount) throw ApiError.notFound('Shop not found');
    return res.json({ muted_until: null, minutes: 0 });
  }

  const clamped = Math.min(MUTE_MAX_MINUTES, Math.max(MUTE_MIN_MINUTES, minutes));
  const r = await query(
    `UPDATE shops
        SET order_alert_muted_until = NOW() + ($2 * interval '1 minute'),
            updated_at = NOW()
      WHERE id = $1
      RETURNING order_alert_muted_until`,
    [req.user.shopId, clamped]
  );
  if (!r.rowCount) throw ApiError.notFound('Shop not found');
  return res.json({ muted_until: r.rows[0].order_alert_muted_until, minutes: clamped });
};
