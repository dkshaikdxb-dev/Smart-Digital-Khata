// "SOLD ON CREDIT" — the ONE definition, in SQL, for every aggregate (batch DATA
// D4). Nothing else in the app is allowed to write `SUM(... type='purchase')`
// and call the answer sales.
//
// THE DEFECT THIS EXISTS FOR
// --------------------------
// The ledger is APPEND-ONLY by design. When a credit order is cancelled — and
// since batch ALERT2 rejecting one is a single tap, so this is the routine path,
// not the rare one — the original `purchase` row STAYS and a compensating
// `adjustment` row is written beside it (utils/orderEdit.postOrderAdjustment).
// The customer's balance is brought back down, so `customers.balance`, and every
// outstanding figure derived from it, is CORRECT.
//
// Every sales figure, though, summed `type='purchase'` and subtracted nothing:
//
//   three credit orders today at ₹800 / ₹600 / ₹500, the ₹600 rejected
//   -> ledger: purchase 800, purchase 600, purchase 500, adjustment 600
//   -> "Sales on credit" reported ₹1,900. ₹1,300 was actually sold.
//
// Worse than the overstatement itself: the collection rate (collections over
// sales) was understated by the same inflation, and "purchases minus collections"
// stopped reconciling with the movement in outstanding — which IS computed from
// balances and IS right. The owner's own two numbers contradicted each other with
// nothing on screen to explain why.
//
// THE DEFINITION
// --------------
//   sold on credit = Σ `purchase`
//                  − Σ `adjustment` rows that reverse a `purchase` of the SAME
//                    order
//
// An adjustment is linked to what it explains by `transactions.order_id`, so
// "reverses a purchase of the same order" is exactly: another row exists for that
// order_id with type 'purchase'. That test is deliberately narrow, and the
// narrowness is the point:
//
//   * A CREDIT order posts a `purchase` when it is placed, so its cancellation or
//     its reduction (batch C) nets off — which is what "sold" should mean.
//   * A PREPAID order never posts a `purchase` at all. Cancelling a paid prepaid
//     order also writes an `adjustment` (the money becomes an advance at the
//     shop), and that adjustment must NOT be subtracted from credit sales: it is
//     not reversing a credit sale, and subtracting it would push the figure BELOW
//     what was sold. The EXISTS test excludes it by construction, with no
//     payment_mode column to keep in sync.
//   * An adjustment with no `order_id` at all (none is written today; the single
//     writer always stamps one) is likewise not a reversal of a credit sale and is
//     ignored rather than guessed at.
//
// Adjustments can never over-subtract within one order: cancelOrderMoney posts
// `charged − already given back`, where `charged` is itself the Σ of that order's
// `purchase` rows. Across a WINDOW boundary a sale made on Monday and reversed on
// Tuesday lowers Tuesday's figure, exactly as a collection is counted on the day
// the money arrives — windows report MOVEMENT, and that keeps the arithmetic
// "sales − collections = change in outstanding" true within the window.
//
// `idx_tx_order` (migration 0068) serves the EXISTS lookup.

// The signed paise a single `transactions` row contributes to credit sales:
// + for a purchase, − for an adjustment that reverses one, 0 for everything else
// (cash, upi, and prepaid/unlinked adjustments).
function signedCreditSaleSql(alias = 't') {
  const a = alias ? `${alias}.` : '';
  return `CASE
            WHEN ${a}type = 'purchase' THEN ${a}amount
            WHEN ${a}type = 'adjustment'
                 AND EXISTS (SELECT 1 FROM transactions rev
                              WHERE rev.order_id = ${a}order_id
                                AND rev.type = 'purchase')
              THEN -${a}amount
            ELSE 0
          END`;
}

/**
 * Net credit sales over whatever rows the surrounding query already selects
 * (its WHERE decides the shop and the window). Drop straight into a SELECT list.
 *
 *   SELECT ${netCreditSalesSql('t')} AS purchases FROM transactions t WHERE ...
 */
function netCreditSalesSql(alias = 't') {
  return `COALESCE(SUM(${signedCreditSaleSql(alias)}), 0)`;
}

/**
 * The same figure for ONE window inside a query that computes several windows at
 * once (the platform collection-rate trend), via an aggregate FILTER.
 * `windowPredicate` must constrain only the window — never the type; the signed
 * expression above already decides which rows count and with which sign.
 */
function netCreditSalesFilteredSql(alias, windowPredicate) {
  return `COALESCE(SUM(${signedCreditSaleSql(alias)}) FILTER (WHERE ${windowPredicate}), 0)`;
}

module.exports = { netCreditSalesSql, netCreditSalesFilteredSql, signedCreditSaleSql };
