-- ORDER MONEY INTEGRITY (batch MONEYFIX) — the schema side of three proven
-- money defects: a cancellation that left the reduction owed, an order placement
-- that could be charged twice, and a ledger that could not say which order a
-- `purchase` belonged to.
--
-- ADDITIVE + IDEMPOTENT: every statement is IF NOT EXISTS, and the one backfill
-- only ever fills a column that is currently NULL. Nothing is rewritten, nothing
-- is deleted, and a re-run against a database holding real rows changes nothing
-- the first run did not already do.

-- ---------------------------------------------------------------------------
-- 1. THE ORIGINAL DELIVERY FEE, snapshotted on the FIRST edit.
--
-- 0068 snapshots `original_subtotal` so "was X, now Y" survives a second and a
-- third reduction. It does NOT snapshot the fee, and the fee MOVES: a reduction
-- that drops the order back under the shop's `free_delivery_min` RE-ADDS the
-- flat delivery fee, so `orders.delivery_fee` after an edit can be LARGER than
-- the one the customer was actually charged. A cancellation that reversed
-- `original_subtotal` + the CURRENT fee would hand the customer money for a fee
-- the shop never took from them.
--
-- NULL means "never edited", exactly as `original_subtotal` NULL does, and the
-- reversal reads the live column in that case. No backfill is possible or
-- wanted: for an order nobody has edited the live column IS the original.
-- ---------------------------------------------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS original_delivery_fee BIGINT;

-- ---------------------------------------------------------------------------
-- 2. IDEMPOTENT ORDER PLACEMENT.
--
-- Exactly the pattern `transactions.client_request_id` has carried since
-- migration 0018 and `order_edits.client_request_id` since 0068: a client-
-- generated stable id plus a PARTIAL unique index, so a retry on a flaky 2G link
-- can never create a second order — and, for a credit order, can never post a
-- second `purchase` against the customer's khata.
--
-- Scoped to the SHOP, like transactions and unlike order_edits (which scope to
-- the order, because an order is the thing being edited). An order does not
-- exist yet when the key is minted, so the shop is the narrowest scope available
-- — and it is the same scope the replay lookup uses.
--
-- PARTIAL, so the millions of orders already placed without a key (and every
-- future order from a client that does not send one) are unaffected: NULL is not
-- equal to NULL, and the index simply does not cover those rows.
-- ---------------------------------------------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_request_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS orders_shop_client_req_uniq
  ON orders (shop_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. TIE THE ORDER PURCHASE ROW TO ITS ORDER.
--
-- `transactions.order_id` exists since 0068 and the compensating 'adjustment'
-- rows have always set it — but the `purchase` a CREDIT order posts when it is
-- placed never did. Only the free-text note said which order it was for.
--
-- That matters for money, not tidiness: reversing a cancelled credit order has
-- to know what was ORIGINALLY charged, and the order's own subtotal/delivery_fee
-- columns are rewritten by an edit. The append-only ledger is the only record an
-- edit cannot move, so the reversal reads it — which requires the link to exist.
--
-- The backfill recovers the link for orders already on file from the note the
-- writer has always used, `'Order ' || orders.id`. It is conservative by
-- construction:
--   * only rows that are still NULL are touched (idempotent, and a hand-set link
--     is never overwritten);
--   * the join is on the ORDER'S OWN id, so a note that does not name a real
--     order matches nothing;
--   * shop_id must agree, so a note copied between shops cannot cross-link;
--   * type must be 'purchase' — payments and adjustments are left alone.
-- A row the note cannot identify simply keeps order_id NULL, and the reversal
-- falls back to the order's snapshotted original columns.
-- ---------------------------------------------------------------------------
UPDATE transactions t
   SET order_id = o.id
  FROM orders o
 WHERE t.order_id IS NULL
   AND t.type = 'purchase'
   AND t.shop_id = o.shop_id
   AND t.note = 'Order ' || o.id::text;
