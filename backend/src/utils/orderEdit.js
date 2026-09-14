const ApiError = require('./ApiError');

// The ONE definition of "what may the owner change on an existing order, and
// what does that do to the money?" (batch C).
//
// Every surface that reduces an order resolves the rules here: the endpoint, the
// delivery-fee recomputation, and the tests. Same shape and the same promise as
// utils/orderEta.js (batch B) and utils/shopOpen.js (batch A) — one helper, pure
// where it can be, so the rule can never drift between call sites.
//
// THE THREE RULES (see migrations/0068_order_edits.sql for the schema side):
//
//  1. REDUCTIONS ONLY. A line may be removed (qty 0) or lowered. Never added,
//     never raised, and the unit price is never touched — a price is what the
//     customer agreed to. `planReduction()` throws 422 `increase_not_allowed`
//     on any attempt, before a single row is written.
//  2. THE LEDGER IS APPEND-ONLY. Nothing here mutates a transaction; the caller
//     posts a NEW compensating 'adjustment' entry.
//  3. EVERY EDIT IS AUDITED. `planReduction()` returns the per-line audit rows
//     the caller writes to `order_edits`, one per line actually changed.

// An order may only be reduced BEFORE the goods are assembled. Once it is
// 'preparing' the shop is already weighing and bagging, and a silent reduction
// then would contradict what is physically in the bag. Anything later is 409.
const EDITABLE_STATUSES = Object.freeze(['pending', 'accepted']);

function isEditableStatus(status) {
  return EDITABLE_STATUSES.includes(status);
}

/**
 * The delivery fee for a given subtotal, by the SAME rule createOrder uses:
 * pickup is always free; for delivery the shop's flat fee applies unless the
 * free-delivery threshold is met. Integer paise in, integer paise out.
 *
 * Extracted here so the fee an EDIT recomputes and the fee an ORDER was created
 * with can never be two different rules.
 *
 * Deliberately does NOT consider `delivery_min_order`. That gate belongs to
 * order CREATION: on an order that already exists the shop has chosen to serve
 * it, and refusing a reduction because the remainder dips under the minimum
 * would leave the owner stuck with exactly the wrong order they were trying to
 * fix.
 */
function deliveryFeeFor({ fulfillmentType, subtotal, shop }) {
  if (fulfillmentType !== 'delivery') return 0;
  const freeMin = shop && shop.free_delivery_min == null ? null : Number(shop.free_delivery_min);
  if (freeMin != null && Number(subtotal) >= freeMin) return 0;
  return Number((shop && shop.delivery_fee) || 0);
}

/**
 * Validate a requested reduction against the order's CURRENT lines and work out
 * exactly what changes. PURE: no I/O, no DB — the current lines are passed in,
 * so the whole money rule is unit-testable.
 *
 * @param {Array} items    the order's current `order_items` rows
 *                         ({ id, name, unit_price, quantity, line_total, weight_grams })
 * @param {Array} lines    the requested [{ order_item_id, qty }]
 * @returns {{
 *   changes: Array,        // per-line audit rows: { order_item_id, name, qty_before,
 *                          //   qty_after, line_total_before, line_total_after, amount_delta }
 *   survivors: Array,      // the lines that remain, with their NEW quantity/line_total
 *   newSubtotal: number,   // paise
 *   subtotalDelta: number, // paise, NEGATIVE or zero
 * }}
 *
 * Throws (nothing is written by the caller when it does):
 *   404 `line_not_found`        an id that is not a line of THIS order
 *   422 `duplicate_line`        the same line twice in one request
 *   422 `increase_not_allowed`  any qty above the line's current quantity
 *   422 `cancel_instead`        every line would end at zero — that is a cancel
 */
function planReduction(items, lines) {
  const byId = new Map((items || []).map((it) => [String(it.id), it]));
  const requested = new Map();

  for (const raw of lines || []) {
    const id = String(raw.order_item_id);
    const item = byId.get(id);
    // An unknown id and an id belonging to ANOTHER order are the same answer —
    // 404 — so probing another shop's line ids reveals nothing.
    if (!item) throw ApiError.notFound('line_not_found');
    if (requested.has(id)) throw ApiError.unprocessable('duplicate_line', { order_item_id: raw.order_item_id });

    const qty = Number(raw.qty);
    if (!Number.isInteger(qty) || qty < 0) {
      throw ApiError.unprocessable('invalid_qty', { order_item_id: raw.order_item_id, qty: raw.qty });
    }
    // RULE 1, the whole point of this batch. An increase is refused loudly, not
    // clamped down to the current quantity: an owner who meant to raise a line
    // must be told this app will not do that, not quietly given a no-op.
    if (qty > Number(item.quantity)) {
      throw ApiError.unprocessable('increase_not_allowed', {
        order_item_id: raw.order_item_id,
        current_qty: Number(item.quantity),
        requested_qty: qty,
      });
    }
    requested.set(id, qty);
  }

  const changes = [];
  const survivors = [];
  let newSubtotal = 0;
  let oldSubtotal = 0;

  for (const it of items || []) {
    const id = String(it.id);
    const qtyBefore = Number(it.quantity);
    const lineBefore = Number(it.line_total);
    oldSubtotal += lineBefore;

    const qtyAfter = requested.has(id) ? requested.get(id) : qtyBefore;

    // The new line total. A UNIT line is unit_price × quantity. A WEIGHED line
    // (weight_grams set, quantity fixed at 1 — see 0020_loose_selling.sql) keeps
    // its server-computed total as long as it survives: its price came from the
    // weight, not from the quantity, so the only reduction available on it is
    // removal. Recomputing it from unit_price (paise per KG) would be wrong by
    // three orders of magnitude.
    const lineAfter = qtyAfter === 0
      ? 0
      : (it.weight_grams != null ? lineBefore : Number(it.unit_price) * qtyAfter);

    if (qtyAfter !== qtyBefore) {
      changes.push({
        order_item_id: it.id,
        name: it.name,
        qty_before: qtyBefore,
        qty_after: qtyAfter,
        line_total_before: lineBefore,
        line_total_after: lineAfter,
        amount_delta: lineAfter - lineBefore, // always <= 0
      });
    }

    if (qtyAfter > 0) {
      survivors.push({ ...it, quantity: qtyAfter, line_total: lineAfter });
      newSubtotal += lineAfter;
    }
  }

  // Emptying an order is not an edit — it is a cancellation, and cancelling has
  // its own path with its own customer message and its own money handling.
  // Refusing here keeps a shop from silently turning an order into a ₹0 ghost.
  if (items && items.length && survivors.length === 0) {
    throw ApiError.unprocessable('cancel_instead');
  }

  return {
    changes,
    survivors,
    newSubtotal,
    oldSubtotal,
    subtotalDelta: newSubtotal - oldSubtotal, // NEGATIVE or zero
  };
}

/**
 * Does this ORDER carry money a reduction has to compensate?
 *
 *   credit         → YES. A `purchase` for the original total already raised the
 *                    customer's balance, so the reduction must bring it back down.
 *   prepaid PAID   → YES. The customer already handed money over and there is NO
 *                    khata entry, so the same compensating entry drives the
 *                    balance NEGATIVE — i.e. the difference becomes an ADVANCE at
 *                    this shop, using the advance mechanism the consumer pre-pay
 *                    flow already proves. No refund API is called, and none is
 *                    invented.
 *   prepaid UNPAID → NO. This is the money defect this argument exists for. The
 *                    predicate used to look at the payment MODE alone, so
 *                    reducing an order the customer had not paid for MINTED
 *                    credit out of nothing: ₹500 ordered, never paid, reduced to
 *                    ₹300, and the khata showed ₹200 of advance for money the
 *                    shop had never received (and the advance cap was never
 *                    consulted). An unpaid prepaid reduction moves no money at
 *                    all; it only changes what is payable.
 *   cash           → NO. Nothing was ever posted: cash is collected on hand-over,
 *                    so the only thing to change is what the owner will ask for.
 *
 * Takes the ORDER ROW, not a mode string, precisely so `payment_status` can
 * never be forgotten again — `isPaidPrepaid` below is the one definition of
 * "prepaid money actually arrived" and both callers now share it.
 */
function needsLedgerAdjustment(order) {
  if (!order) return false;
  if (order.payment_mode === 'credit') return true;
  return isPaidPrepaid(order);
}

// ===========================================================================
// THE ONE WAY MONEY MOVES BACK TO A CUSTOMER (batch C + batch ALERT2)
//
// The house rule is "prepaid: debit/credit only, NEVER a refund". A reduction
// (batch C) already honours it; batch ALERT2 makes a CANCEL honour it too. Both
// now go through the single writer below, so the two can never drift into two
// different ways of moving the same money for the same reason.
//
// The shape is fixed and is the shape batch C established:
//   type   'adjustment'   — neither a purchase (nothing more is owed) nor a
//                           payment (the customer handed nothing over): the shop
//                           correcting its own bill. Every aggregate in the app
//                           sums `purchase` or `cash`/`upi`, so an adjustment is
//                           excluded from all of them automatically.
//   method 'adjustment'   — says plainly that no cash, no UPI and no credit
//                           changed hands.
//   order_id set          — the ledger row is tied to the order it explains.
//   balance -= amount     — for a CREDIT order that cancels out what was owed;
//                           for a PREPAID order it drives the balance NEGATIVE,
//                           i.e. the money becomes an ADVANCE at this shop,
//                           using the advance mechanism the consumer pre-pay
//                           flow already proves. No refund API is called and
//                           none is invented.
// ===========================================================================

/**
 * Post ONE compensating 'adjustment' and lower the customer's balance by it,
 * on the caller's transaction client so it commits with whatever it explains.
 *
 * Writes NOTHING and returns null for a non-positive amount — this writer only
 * ever moves money TOWARDS the customer, so a zero or negative "adjustment"
 * (which could only ever come from a bug) is refused rather than turned into a
 * charge.
 *
 * @returns {Promise<object|null>} the inserted transactions row, or null
 */
async function postOrderAdjustment(client, { shopId, customerId, orderId, amount, note, actorId }) {
  const paise = Number(amount);
  if (!Number.isFinite(paise) || paise <= 0) return null;

  const tx = await client.query(
    `INSERT INTO transactions
       (shop_id, customer_id, type, amount, method, note, source, created_by, order_id)
     VALUES ($1,$2,'adjustment',$3,'adjustment',$4,'api',(SELECT u.id FROM users u WHERE u.id = $5),$6)
     RETURNING *`,
    [shopId, customerId, paise, note, actorId || null, orderId]
  );
  await client.query(
    'UPDATE customers SET balance = balance - $1, updated_at = NOW() WHERE id = $2',
    [paise, customerId]
  );
  return tx.rows[0];
}

/**
 * What this CREDIT order actually put ON the khata when it was placed, in paise.
 *
 * THE DEFECT THIS EXISTS FOR. `editItems` WRITES the reduced totals back to
 * `orders.subtotal` / `orders.delivery_fee` AND posts an 'adjustment' for the
 * reduction. Deriving the charge from those columns and then subtracting the
 * adjustments again removed the reduction TWICE, so a reduce-then-cancel left
 * the customer owing exactly the reduction on an order that was never supplied:
 * 500 rupees ordered, reduced to 250 (balance 250), cancelled -> charged read
 * back as 250, given was 250, amount 0, nothing posted, 250 still owed forever.
 *
 * SO WE READ THE LEDGER, NOT THE ORDER ROW. `transactions` is append-only: the
 * `purchase` rows for this order are what the shop actually charged, and no edit
 * can rewrite them. `orders.subtotal`/`delivery_fee` are MUTABLE by design — an
 * edit is supposed to move them — which makes them the wrong source of truth for
 * "what was originally charged" by construction, not by accident.
 *
 * THE FALLBACK, and why it is shaped the way it is. An order whose purchase row
 * predates `transactions.order_id` being stamped (migration 0071 backfills what
 * it can from the `Order <id>` note; a hand-fixed or imported row may still have
 * none) falls back to the order's ORIGINAL columns — `original_subtotal` and
 * `original_delivery_fee`, both snapshotted once on the FIRST edit (0068, 0071)
 * — never the current ones. The delivery fee has to be snapshotted separately
 * because a reduction can RE-ADD a fee: dropping back under `free_delivery_min`
 * puts the flat fee back, `editItems` correctly posts no adjustment for that (it
 * would be an increase), but it still writes the larger fee to the order row.
 * Reversing `original_subtotal` + the CURRENT delivery fee would then hand the
 * customer money for a fee the shop never charged them.
 */
async function originalCreditCharge(client, order) {
  const res = await client.query(
    `SELECT COALESCE(SUM(amount), 0)::bigint AS charged
       FROM transactions
      WHERE order_id = $1 AND type = 'purchase'`,
    [order.id]
  );
  const fromLedger = Number(res.rows[0].charged) || 0;
  if (fromLedger > 0) return fromLedger;

  const subtotal = order.original_subtotal == null ? order.subtotal : order.original_subtotal;
  const fee = order.original_delivery_fee == null ? order.delivery_fee : order.original_delivery_fee;
  return Number(subtotal || 0) + Number(fee || 0);
}

/**
 * CANCELLING AN ORDER — the whole money rule, in ONE place.
 *
 * Two paths reach a cancellation: the customer cancelling their own order, and
 * the owner REJECTING it (which batch ALERT2 put behind a prominent button, so
 * it is now the common path, not the rare one). They MUST move money
 * identically; before this helper they did not, and an owner rejecting a credit
 * order left the customer owing for goods that were never supplied.
 *
 *   credit       → reverse the whole amount that was added to the khata when the
 *                  order was placed — read from the LEDGER, not from the order's
 *                  (mutable, already-reduced) columns; see originalCreditCharge
 *                  above — LESS anything already given back by an edit, so a
 *                  reduce-then-reject can neither give the same paise back twice
 *                  nor leave the reduction owed forever.
 *   prepaid paid → the money already taken becomes shop credit (the house rule:
 *                  debit/credit only, never a refund).
 *   prepaid unpaid, cash → nothing was ever posted, so nothing is posted now.
 *
 * Both cases go through postOrderAdjustment, i.e. type/method 'adjustment'.
 * That matters beyond tidiness: the old credit reversal posted type 'cash',
 * which every collections figure in the app sums (the daily digest, the
 * analytics overview, the owner insights). A cancelled credit order therefore
 * reported itself as money the shop had COLLECTED. It never was — the customer
 * handed over nothing. 'adjustment' is excluded from those sums by construction.
 *
 * @returns {Promise<object|null>} the inserted transactions row, or null when
 *          this order moves no money.
 */
async function cancelOrderMoney(client, order, { actorId } = {}) {
  if (!order) return null;

  if (order.payment_mode === 'credit') {
    const charged = await originalCreditCharge(client, order);
    // Anything an edit already took off this order has already left the khata.
    const back = await client.query(
      `SELECT COALESCE(SUM(amount), 0)::bigint AS given
         FROM transactions
        WHERE order_id = $1 AND type = 'adjustment'`,
      [order.id]
    );
    const amount = charged - Number(back.rows[0].given);
    if (amount <= 0) return null;
    return postOrderAdjustment(client, {
      shopId: order.shop_id,
      customerId: order.customer_id || order.cust_id,
      orderId: order.id,
      amount,
      note: `Order ${order.id} cancelled — khata entry reversed`,
      actorId,
    });
  }

  return creditPrepaidOnCancel(client, order, { actorId });
}

/**
 * Is this an order whose cancellation must become shop credit? Only a PREPAID
 * order the customer has actually PAID for. A prepaid order still awaiting
 * payment has no money to move; cash never posted anything; credit has its own
 * (older, unchanged) reversal.
 */
function isPaidPrepaid(order) {
  return Boolean(order) && order.payment_mode === 'prepaid' && order.payment_status === 'paid';
}

/**
 * How much of a paid prepaid order is still owed back to the customer, in paise.
 *
 *   what they actually paid            (the paid `payment_orders` rows for this
 *                                       order; the order total is the fallback
 *                                       when no payment row is on file)
 *   MINUS what this order has already
 *   credited them                      (the 'adjustment' rows already posted —
 *                                       i.e. an earlier REDUCTION)
 *
 * Subtracting the earlier adjustments is what keeps a reduce-then-cancel from
 * crediting the reduced part twice: batch C already gave that difference back,
 * and only the remainder is still the customer's.
 *
 * Never negative.
 */
async function prepaidCreditRemaining(client, order) {
  const paidRes = await client.query(
    `SELECT COALESCE(SUM(amount), 0)::bigint AS paid
       FROM payment_orders WHERE order_id = $1 AND status = 'paid'`,
    [order.id]
  );
  const paid = Number(paidRes.rows[0].paid) || 0;
  // A paid prepaid order with no payment_orders row on file (a hand-fixed row, a
  // legacy import) still has a defensible figure: the order total, which is what
  // the customer was asked for. Better than crediting nothing.
  const base = paid > 0 ? paid : Number(order.subtotal) + Number(order.delivery_fee);

  const adjRes = await client.query(
    `SELECT COALESCE(SUM(amount), 0)::bigint AS adjusted
       FROM transactions WHERE order_id = $1 AND type = 'adjustment'`,
    [order.id]
  );
  const already = Number(adjRes.rows[0].adjusted) || 0;

  return Math.max(0, base - already);
}

/**
 * THE PREPAID CANCEL RULE (batch ALERT2), in one place for every caller: the
 * owner rejecting an order (order.controller.updateStatus) and the customer
 * cancelling their own (my.controller.cancelOrder).
 *
 * A cancelled PAID PREPAID order turns the money the customer handed over into
 * CREDIT AT THIS SHOP — one 'adjustment', `order_id` set, balance lowered by
 * exactly that amount. There is no refund, no Razorpay call and no note
 * promising that somebody will sort it out by hand.
 *
 * Call it INSIDE the transaction that cancels the order, while the order and
 * customer rows are locked. Returns the adjustment row, or null when there is
 * nothing to credit (not prepaid, not paid, or already fully credited).
 *
 * IDEMPOTENCY is the caller's terminal guard: a cancelled order is terminal, so
 * a second cancel is refused with a 409 before reaching here. The
 * already-credited subtraction in prepaidCreditRemaining() is the second rail.
 */
async function creditPrepaidOnCancel(client, order, { actorId } = {}) {
  if (!isPaidPrepaid(order)) return null;
  const amount = await prepaidCreditRemaining(client, order);
  if (amount <= 0) return null;
  return postOrderAdjustment(client, {
    shopId: order.shop_id,
    customerId: order.customer_id,
    orderId: order.id,
    amount,
    note: `Order ${order.id} cancelled — prepaid amount kept as shop credit`,
    actorId,
  });
}

// ===========================================================================
// THE PROVIDER SIDE OF A CANCELLATION (C3)
//
// Cancelling an order locally used to leave the shop's hosted payment link LIVE,
// and `createPaymentLinkForShop` asks the provider to keep REMINDING the
// customer about it. So the customer kept being chased for an order that no
// longer existed, and a payment that arrived afterwards settled against nothing.
//
// This closes the link. It is BEST EFFORT on purpose: the cancellation itself is
// already committed and must never be reported as failed because the provider
// was unreachable. The webhook guard in webhook.controller.reconcilePayment is
// the rail that actually protects the money — if a payment lands anyway it
// becomes shop credit on the customer's khata rather than vanishing.
// ===========================================================================

/**
 * Cancel every still-open hosted payment link for an order, provider-side and
 * locally. Call AFTER the cancelling transaction has COMMITTED — it makes a
 * network call and must not be holding a row lock while it does.
 *
 * Never throws. Returns the number of local rows moved to 'cancelled'.
 */
async function cancelOrderPaymentLinks(orderId, { query, razorpay, logger } = {}) {
  if (!orderId || !query) return 0;
  let rows = [];
  try {
    const res = await query(
      `SELECT id, shop_id, provider_link_id FROM payment_orders
        WHERE order_id = $1 AND status NOT IN ('paid', 'failed', 'cancelled')`,
      [orderId]
    );
    rows = res.rows;
  } catch (err) {
    if (logger) logger.warn({ err: err.message, orderId }, 'Could not read payment links to cancel');
    return 0;
  }

  let cancelled = 0;
  for (const row of rows) {
    if (row.provider_link_id && razorpay && razorpay.cancelPaymentLinkForShop) {
      try {
        await razorpay.cancelPaymentLinkForShop(row.shop_id, row.provider_link_id);
      } catch (err) {
        // Non-fatal by design. The link may already be paid or cancelled at the
        // provider, or the provider may simply be down.
        if (logger) logger.warn({ err: err.message, orderId, link: row.provider_link_id }, 'Payment link cancel failed');
      }
    }
    try {
      // Only a row that is STILL open is closed: a payment that settled between
      // the read and here has already marked it 'paid' and must not be undone.
      const upd = await query(
        `UPDATE payment_orders SET status = 'cancelled'
          WHERE id = $1 AND status NOT IN ('paid', 'failed', 'cancelled')`,
        [row.id]
      );
      cancelled += upd.rowCount;
    } catch (err) {
      if (logger) logger.warn({ err: err.message, id: row.id }, 'Could not mark payment link cancelled');
    }
  }
  return cancelled;
}

module.exports = {
  EDITABLE_STATUSES,
  originalCreditCharge,
  cancelOrderPaymentLinks,
  isEditableStatus,
  deliveryFeeFor,
  planReduction,
  needsLedgerAdjustment,
  postOrderAdjustment,
  isPaidPrepaid,
  prepaidCreditRemaining,
  creditPrepaidOnCancel,
  cancelOrderMoney,
};
