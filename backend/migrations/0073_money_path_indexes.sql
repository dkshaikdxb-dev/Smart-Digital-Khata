-- MONEY-PATH INDEXES (batch DATA D6).
--
-- `payment_orders` is indexed on shop_id (0001) and on the two provider ids
-- (0002). Two more lookups run on the money path on EVERY request that uses
-- them, and both were sequential scans over a table that grows without bound —
-- one row per payment attempt, forever, for the whole platform:
--
--   1. BY ORDER. Cancelling or rejecting a paid prepaid order asks "what did this
--      customer actually pay for this order?" (utils/orderEdit
--      .prepaidCreditRemaining) and closing the provider link asks "which links
--      belong to this order?" (cancelOrderPaymentLinks). Rejection became a
--      one-tap button in batch ALERT2, so this is now a routine path.
--
--   2. BY CUSTOMER WITHIN A SHOP. Every consumer pre-pay sums the customer's
--      in-flight advances at that shop before allowing another one. It is on the
--      critical path of placing a prepaid order.
--
-- ADDITIVE + IDEMPOTENT: two CREATE INDEX IF NOT EXISTS, no data touched, no
-- column changed, nothing dropped. Safe against a database holding production
-- rows: index creation takes a SHARE lock (readers are unaffected; writers to
-- payment_orders wait only for the build). The migration runner wraps each file
-- in one transaction, so CONCURRENTLY is not available here and is not needed at
-- this table's size.

-- 1. The order a payment belongs to.
CREATE INDEX IF NOT EXISTS idx_payment_orders_order
  ON payment_orders (order_id);

-- 2. A customer's payments at one shop. Leading column customer_id, so it also
--    serves a customer-only lookup; shop_id second because every read is already
--    shop-scoped.
CREATE INDEX IF NOT EXISTS idx_payment_orders_customer_shop
  ON payment_orders (customer_id, shop_id);
