const { query, withTx } = require('../config/db');
const ApiError = require('../utils/ApiError');
const whatsapp = require('../services/whatsapp.service');
const { renderLang, withCustomerNameLocal } = require('../utils/name-local');
// The ONE shared "this order still needs alerting" definition (batch ORDERALERT).
const { needsAlertingSql } = require('../utils/orderAlerts');
// The ONE shared ready-time rule: the chips, the ceiling, the clamp (batch B).
const { getEtaConfig, clampEta } = require('../utils/orderEta');
// Every customer-facing order line, en + hi authored (batch B). Replaces the
// hardcoded English sentence this controller used to build inline.
const customerCopy = require('../utils/order-customer-copy');
// The ONE shared reduction rule: what may be edited, what it does to the
// delivery fee, and what the money does per payment mode (batch C).
const {
  isEditableStatus, deliveryFeeFor, planReduction, needsLedgerAdjustment,
} = require('../utils/orderEdit');

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
 *
 * `o.*` carries the ready-time promise (`eta_minutes`, `promised_at`,
 * `eta_set_at` — batch B), so the list can show what was promised with no second
 * request. Nothing here computes "late": each UI derives that from promised_at
 * and its own clock, so there is no column for a job to keep honest.
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
  // The line-by-line edit history (batch C). ALWAYS sent — an empty array for an
  // order nobody has touched — so an owner can never see a reduced order without
  // also seeing who reduced it and when. A silent change to a bill is the thing
  // this batch exists to prevent.
  const edits = await listEdits(query, req.params.id);
  res.json({ order: { ...withCustomerNameLocal(r.rows[0], lang), items: items.rows, edits } });
};

/**
 * The audit trail of one order's reductions, oldest first, with the editor's
 * name where the `users` row still exists. `runner` is the query function (the
 * pool, or a transaction client) so the same shape is returned inside and
 * outside a transaction.
 */
async function listEdits(runner, orderId) {
  const r = await runner(
    `SELECT e.id, e.order_item_id, e.name, e.qty_before, e.qty_after,
            e.amount_delta, e.created_at, e.edited_by, u.name AS edited_by_name
       FROM order_edits e
       LEFT JOIN users u ON u.id = e.edited_by
      WHERE e.order_id = $1
      ORDER BY e.created_at ASC, e.id ASC`,
    [orderId]
  );
  return r.rows;
}

// The customer's language for the WhatsApp copy. There is NO `customers.language`
// column in this schema today (checked across every migration), so this reads a
// field that does not exist yet and order-customer-copy resolves the undefined
// value to its English fallback. Written this way — rather than inventing a
// column — so a future migration that adds one needs only that column added to
// the SELECT above. Same convention as my.controller.resolveOwnerContact and
// order-alert.service.ownerLang (batch ORDERALERT).
function customerLang(row) {
  return customerCopy.resolveLang(row && row.customer_language);
}

/**
 * Send one customer-facing order line over WhatsApp, fire-and-forget. Respects
 * notifications_enabled and never lets a WhatsApp failure reach the owner: the
 * status change is already committed and must not be reported as failed because
 * Meta was unreachable.
 */
function notifyCustomer({ customer, shopName, order, updated }) {
  if (customer.notifications_enabled === false) return;
  const message = customerCopy.buildCustomerMessage({
    lang: customerLang(customer),
    customerName: customer.name,
    shopName,
    status: order.status,
    promisedAt: order.promised_at,
    updated: Boolean(updated),
  });
  whatsapp.sendText(customer.phone, message).catch(() => {});
}

/**
 * PATCH /orders/:id/status { status, eta_minutes? } — advance the order.
 *  - A completed/cancelled order is terminal → 409.
 *  - Only a strictly-forward move or 'cancelled' is allowed → else 422.
 *
 * ONE-TAP ACCEPT (batch B). The OPTIONAL `eta_minutes` is the coarse chip the
 * owner tapped. It is only meaningful on the move to 'accepted' — sent with any
 * other target status it is a 422 `eta_not_applicable` and NOTHING is written,
 * because silently ignoring half of a request is how a client ends up believing
 * a promise that was never stored. Omitting it is legitimate: the owner
 * genuinely may not know, and the order is then accepted with all three eta
 * columns left NULL rather than given an invented time.
 *
 * The promise is stamped in the SAME update that sets the status and the
 * implicit ORDERALERT acknowledgement, so accepting an order is exactly one
 * round trip and exactly one row version.
 *
 * On success the customer is notified over WhatsApp (respecting
 * notifications_enabled), fire-and-forget — with the promised CLOCK TIME in it.
 */
exports.updateStatus = async (req, res) => {
  const { status: next } = req.body;
  const etaRequested = req.body.eta_minutes !== undefined && req.body.eta_minutes !== null;

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

    // A ready-time promise only means something at the moment of ACCEPTING. On
    // any other transition it is refused, not dropped — the owner's client is
    // told plainly that this request did nothing.
    if (etaRequested && next !== 'accepted') {
      throw ApiError.unprocessable('eta_not_applicable', { to: next });
    }

    // Clamp against the LIVE platform ceiling (getEtaConfig never throws), so a
    // stale client offering a chip an admin has since lowered cannot promise
    // beyond the ceiling. A value the clamp cannot use at all resolves to NULL,
    // i.e. "accepted without a time" — never to an invented one.
    const cfg = etaRequested ? await getEtaConfig() : null;
    const etaMinutes = etaRequested ? clampEta(req.body.eta_minutes, cfg) : null;

    // A CASH order is settled on hand-over: completing it means the owner has
    // collected the cash, so flip payment_status pending -> paid. Credit and
    // prepaid payment_status is untouched here (khata / Razorpay own those).
    const collectCash = order.payment_mode === 'cash' && next === 'completed';
    // Acknowledging the new-order alert is IMPLICIT (batch ORDERALERT): any move
    // out of 'pending' means the owner has plainly seen the order, so the SAME
    // update stamps acknowledged_at/by. Accepting silences the nagging with no
    // extra tap; so does cancelling. COALESCE keeps an earlier explicit "Seen"
    // timestamp — the first acknowledgement is the one that counts.
    // The ready-time promise rides along in the SAME statement: status,
    // acknowledgement and promise are one row version, so a client can never
    // observe an accepted order that has not got its promise yet. NOW() is the
    // DATABASE clock, the same one `promised_at` is later compared against.
    const upd = await client.query(
      `UPDATE orders
          SET status = $1,
              payment_status = CASE WHEN $3 THEN 'paid' ELSE payment_status END,
              acknowledged_at = COALESCE(acknowledged_at, NOW()),
              acknowledged_by = COALESCE(acknowledged_by, (SELECT u.id FROM users u WHERE u.id = $4)),
              eta_minutes = CASE WHEN $5::int IS NOT NULL THEN $5::int ELSE eta_minutes END,
              promised_at = CASE WHEN $5::int IS NOT NULL THEN NOW() + ($5::int * interval '1 minute') ELSE promised_at END,
              eta_set_at  = CASE WHEN $5::int IS NOT NULL THEN NOW() ELSE eta_set_at END,
              updated_at = NOW()
        WHERE id = $2
        RETURNING *`,
      [next, order.id, collectCash, actorId(req), etaMinutes]
    );
    return {
      order: upd.rows[0],
      customer: {
        name: order.customer_name,
        phone: order.customer_phone,
        notifications_enabled: order.notifications_enabled,
        customer_language: order.customer_language,
      },
      shopName: order.shop_name,
    };
  });

  notifyCustomer({ customer: result.customer, shopName: result.shopName, order: result.order });

  res.json({ order: result.order });
};

/**
 * PATCH /orders/:id/eta { eta_minutes } — "NEED MORE TIME".
 *
 * Re-promises an order that is ALREADY accepted: `promised_at` is recomputed
 * from NOW (not extended from the old promise — the owner is saying "from here,
 * this long"), and the customer gets a message that says plainly the time has
 * moved rather than a second contradictory "ready by".
 *
 * This is the whole busy-mode story: the same three chips the owner already
 * knows, on an order they already accepted. There is deliberately no second
 * "busy mode" for them to learn and no way to promise a time on an order that
 * has not been accepted yet.
 *
 *   terminal order (completed/cancelled)  → 409
 *   still pending                         → 422 `not_accepted_yet`
 *   another shop's order                  → 404 (never 403; probing reveals nothing)
 */
exports.setEta = async (req, res) => {
  const cfg = await getEtaConfig();
  const minutes = clampEta(req.body.eta_minutes, cfg);
  // The route's validator already rejects 0/negative/non-integer with a 400;
  // this is the belt-and-braces guard so a promise is never stamped from a
  // value the clamp could not make sense of.
  if (minutes == null) throw ApiError.badRequest('invalid_eta');

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
      throw ApiError.conflict('Cannot change the ready time on a completed or cancelled order');
    }
    // At or past 'accepted' — so an owner can still push the time out while the
    // order is preparing or ready, which is exactly when they discover they need to.
    if (!(STATUS_RANK[order.status] >= STATUS_RANK.accepted)) {
      throw ApiError.unprocessable('not_accepted_yet', { status: order.status });
    }

    const upd = await client.query(
      `UPDATE orders
          SET eta_minutes = $2::int,
              promised_at = NOW() + ($2::int * interval '1 minute'),
              eta_set_at  = NOW(),
              updated_at  = NOW()
        WHERE id = $1
        RETURNING *`,
      [order.id, minutes]
    );
    return {
      order: upd.rows[0],
      customer: {
        name: order.customer_name,
        phone: order.customer_phone,
        notifications_enabled: order.notifications_enabled,
        customer_language: order.customer_language,
      },
      shopName: order.shop_name,
    };
  });

  notifyCustomer({
    customer: result.customer, shopName: result.shopName, order: result.order, updated: true,
  });

  res.json({ order: result.order });
};

/**
 * GET /orders/eta-config — the coarse chips the owner should be offered and the
 * ceiling they are clamped to, read LIVE from platform_settings. The owner web
 * console and the owner app both render whatever this returns, so an admin can
 * change the vocabulary of the accept button without shipping a client.
 */
exports.etaConfig = async (_req, res) => {
  res.json(await getEtaConfig());
};

// ===========================================================================
// EDIT THE ORDER WHILE ACCEPTING (batch C). The customer orders six things and
// the shop has four: the owner reduces the order, and the money follows.
// ===========================================================================

/** The order row + its surviving lines + its full edit history, in one shape. */
async function freshOrder(runner, orderId) {
  const o = await runner(
    `SELECT o.*, (o.subtotal + o.delivery_fee) AS total,
            c.name AS customer_name, c.phone AS customer_phone
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
      WHERE o.id = $1`,
    [orderId]
  );
  const items = await runner(
    `SELECT id, product_id, name, unit_price, quantity, line_total, weight_grams
       FROM order_items WHERE order_id = $1 ORDER BY name ASC`,
    [orderId]
  );
  const edits = await listEdits(runner, orderId);
  return { ...o.rows[0], items: items.rows, edits };
}

/**
 * Tell the customer what the shop changed, fire-and-forget. Same rules as
 * notifyCustomer(): respects notifications_enabled, and a WhatsApp failure never
 * reaches the owner — the money is already committed and must not be reported as
 * failed because Meta was unreachable.
 */
function notifyCustomerEdit({ customer, shopName, paymentMode, changes, oldTotal, newTotal, reduction, oldFee, newFee }) {
  if (customer.notifications_enabled === false) return;
  const message = customerCopy.buildOrderEditMessage({
    lang: customerLang(customer),
    customerName: customer.name,
    shopName,
    paymentMode,
    changes,
    oldTotal,
    newTotal,
    reduction,
    oldFee,
    newFee,
  });
  whatsapp.sendText(customer.phone, message).catch(() => {});
}

/**
 * PATCH /orders/:id/items { lines: [{ order_item_id, qty }], client_request_id? }
 *
 * REDUCE an order the shop cannot fully supply. `qty: 0` removes the line; any
 * qty must be at or below what the line currently has. THIS TOUCHES MONEY, so
 * the three rules are load-bearing and each is enforced here:
 *
 *  1. REDUCTIONS ONLY — planReduction() throws 422 `increase_not_allowed` for a
 *     qty above the current one, and there is no path at all that touches
 *     `unit_price`. The customer agreed to a price; the shop does not get to
 *     revise it afterwards.
 *  2. THE LEDGER IS APPEND-ONLY — the original `purchase` row is never read for
 *     update, never amended and never deleted. A reduction posts ONE NEW
 *     compensating 'adjustment' entry linked to the order by `order_id`.
 *  3. EVERY EDIT IS AUDITED — one `order_edits` row per changed line, with the
 *     acting user and the timestamp, plus `edited_at/by` on the order and a
 *     one-time `original_subtotal` snapshot so "was X, now Y" survives a second
 *     and a third edit.
 *
 * GUARDS
 *   status not pending/accepted  → 409 `order_not_editable` (past that, the
 *                                  goods are being assembled and a silent
 *                                  reduction would contradict the bag)
 *   another shop's order         → 404 (never 403; probing reveals nothing)
 *   unknown / foreign line id    → 404 `line_not_found`
 *   every line reduced to zero   → 422 `cancel_instead`
 *   replayed client_request_id   → the CURRENT state, money applied exactly once
 *
 * LOCKING. The order and the customer row are taken in ONE statement with
 * `FOR UPDATE OF o, c`, the same pair and the same order my.controller's
 * cancelOrder uses. transaction.controller takes only the customer lock, so
 * there is no cycle between the two paths and two concurrent edits of the same
 * order serialise on the order row instead of double-applying.
 *
 * NO CREDIT-LIMIT OR FAMILY-LIMIT CHECK, deliberately: those exist to stop what
 * a customer OWES from growing past an agreed ceiling, and a reduction only ever
 * lowers it. Running them here would be theatre — and worse, a customer already
 * over their limit could not be given money back.
 */
exports.editItems = async (req, res) => {
  const clientRequestId = req.body.client_request_id || null;

  const result = await withTx(async (client) => {
    const r = await client.query(
      `SELECT o.*, c.id AS cust_id, c.name AS customer_name, c.phone AS customer_phone,
              c.notifications_enabled,
              s.name AS shop_name, s.delivery_fee AS shop_delivery_fee,
              s.free_delivery_min AS shop_free_delivery_min
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
         JOIN shops s ON s.id = o.shop_id
        WHERE o.id = $1 AND o.shop_id = $2
        FOR UPDATE OF o, c`,
      [req.params.id, req.user.shopId]
    );
    if (!r.rowCount) throw ApiError.notFound('Order not found');
    const order = r.rows[0];

    if (!isEditableStatus(order.status)) {
      throw ApiError.conflict('order_not_editable', { status: order.status });
    }

    // IDEMPOTENT REPLAY, checked while holding the order lock: an owner on 2G
    // retries the same edit and the money must move exactly once. The unique
    // index on (order_id, client_request_id, order_item_id) is the second rail.
    if (clientRequestId) {
      const dup = await client.query(
        'SELECT 1 FROM order_edits WHERE order_id = $1 AND client_request_id = $2 LIMIT 1',
        [order.id, clientRequestId]
      );
      if (dup.rowCount) {
        return { replayed: true, order: await freshOrder(client.query.bind(client), order.id) };
      }
    }

    const itemsRes = await client.query(
      `SELECT id, product_id, name, unit_price, quantity, line_total, weight_grams
         FROM order_items WHERE order_id = $1 ORDER BY name ASC`,
      [order.id]
    );

    // Validate + work out the whole change before writing anything, so a bad
    // line anywhere in the request leaves the order exactly as it was.
    const plan = planReduction(itemsRes.rows, req.body.lines);

    // A request that changes nothing (every qty equal to what is already there)
    // is not an error and not an edit: write nothing, stamp nothing, notify
    // nobody, and hand back the current state.
    if (!plan.changes.length) {
      return { noop: true, order: await freshOrder(client.query.bind(client), order.id) };
    }

    const oldSubtotal = Number(order.subtotal);
    const oldFee = Number(order.delivery_fee);
    const oldTotal = oldSubtotal + oldFee;

    const newSubtotal = plan.newSubtotal;
    // The delivery fee is recomputed by the SAME rule createOrder used, so a
    // reduction that drops the order back under `free_delivery_min` re-adds the
    // fee instead of quietly keeping a threshold the order no longer meets.
    // `delivery_min_order` is deliberately NOT re-enforced: the shop has already
    // chosen to serve this order.
    const newFee = deliveryFeeFor({
      fulfillmentType: order.fulfillment_type,
      subtotal: newSubtotal,
      shop: { delivery_fee: order.shop_delivery_fee, free_delivery_min: order.shop_free_delivery_min },
    });
    const newTotal = newSubtotal + newFee;
    const reduction = oldTotal - newTotal;

    // Apply the lines and audit each one in the same loop, so an audit row can
    // never be missing for a line that moved.
    for (const c of plan.changes) {
      if (c.qty_after === 0) {
        await client.query('DELETE FROM order_items WHERE id = $1 AND order_id = $2', [c.order_item_id, order.id]);
      } else {
        await client.query(
          'UPDATE order_items SET quantity = $1, line_total = $2 WHERE id = $3 AND order_id = $4',
          [c.qty_after, c.line_total_after, c.order_item_id, order.id]
        );
      }
      await client.query(
        `INSERT INTO order_edits
           (order_id, order_item_id, name, qty_before, qty_after, amount_delta, edited_by, client_request_id)
         VALUES ($1,$2,$3,$4,$5,$6,(SELECT u.id FROM users u WHERE u.id = $7),$8)`,
        [order.id, c.order_item_id, c.name, c.qty_before, c.qty_after, c.amount_delta, actorId(req), clientRequestId]
      );
    }

    // `original_subtotal` is snapshotted on the FIRST edit only (COALESCE), so
    // "was X, now Y" keeps meaning the ORIGINAL X after a second reduction.
    await client.query(
      `UPDATE orders
          SET subtotal = $2,
              delivery_fee = $3,
              original_subtotal = COALESCE(original_subtotal, $4),
              edited_at = NOW(),
              edited_by = (SELECT u.id FROM users u WHERE u.id = $5),
              updated_at = NOW()
        WHERE id = $1`,
      [order.id, newSubtotal, newFee, oldSubtotal, actorId(req)]
    );

    // THE MONEY, per payment mode (see utils/orderEdit.needsLedgerAdjustment):
    //   credit  — one compensating 'adjustment' brings the balance DOWN by
    //             exactly `reduction`; the original purchase row is untouched.
    //   prepaid — the same entry, which drives the balance NEGATIVE: the
    //             difference becomes an ADVANCE at this shop. No refund API is
    //             called and no payment_orders row is touched.
    //   cash    — nothing was ever posted, so nothing is posted now.
    //
    // `reduction > 0` is the guard that keeps rule 1 true end to end. It can be
    // zero or negative ONLY when a reduction pushed the order back under the
    // shop's free-delivery threshold and the fee returned; in that case we post
    // NOTHING rather than raising what the customer owes for an order they
    // already agreed to.
    let adjustment = null;
    if (needsLedgerAdjustment(order.payment_mode) && reduction > 0) {
      const tx = await client.query(
        `INSERT INTO transactions
           (shop_id, customer_id, type, amount, method, note, source, created_by, order_id)
         VALUES ($1,$2,'adjustment',$3,'adjustment',$4,'api',(SELECT u.id FROM users u WHERE u.id = $5),$6)
         RETURNING *`,
        [req.user.shopId, order.cust_id, reduction, `Order ${order.id} reduced by the shop`, actorId(req), order.id]
      );
      adjustment = tx.rows[0];
      await client.query(
        'UPDATE customers SET balance = balance - $1, updated_at = NOW() WHERE id = $2',
        [reduction, order.cust_id]
      );
    }

    return {
      order: await freshOrder(client.query.bind(client), order.id),
      adjustment,
      changes: plan.changes,
      oldTotal,
      newTotal,
      reduction,
      oldFee,
      newFee,
      customer: {
        name: order.customer_name,
        phone: order.customer_phone,
        notifications_enabled: order.notifications_enabled,
        customer_language: order.customer_language,
      },
      shopName: order.shop_name,
      paymentMode: order.payment_mode,
    };
  });

  // Only a genuinely applied edit tells the customer. A replay or a no-op must
  // never send a second "your order was reduced" message for the same change.
  if (!result.replayed && !result.noop) {
    notifyCustomerEdit(result);
  }

  res.json({
    order: result.order,
    adjustment: result.adjustment || null,
    replayed: Boolean(result.replayed),
  });
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
