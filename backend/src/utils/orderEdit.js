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
 * Does this payment mode carry a khata entry that a reduction has to compensate?
 *
 *   credit  → YES. A `purchase` for the original total already raised the
 *             customer's balance, so the reduction must bring it back down.
 *   prepaid → YES. The customer already paid online and there is NO khata entry,
 *             so the same compensating entry drives the balance NEGATIVE — i.e.
 *             the difference becomes an ADVANCE at this shop, using the advance
 *             mechanism the consumer pre-pay flow already proves. No refund API
 *             is called, and none is invented.
 *   cash    → NO. Nothing was ever posted: cash is collected on hand-over, so
 *             the only thing to change is what the owner will ask for.
 */
function needsLedgerAdjustment(paymentMode) {
  return paymentMode === 'credit' || paymentMode === 'prepaid';
}

module.exports = {
  EDITABLE_STATUSES,
  isEditableStatus,
  deliveryFeeFor,
  planReduction,
  needsLedgerAdjustment,
};
