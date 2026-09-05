-- Cash payment mode (M8) — pay cash on pickup/delivery. Most rural kirana orders
-- are settled in cash on hand-over, so add 'cash' as a third payment mode WITHOUT
-- touching the khata (credit) or the online Razorpay (prepaid) money math.
--
-- ADDITIVE + IDEMPOTENT: drop and recreate the payment_mode CHECK to widen the
-- allowed set. Postgres auto-names the inline column CHECK `orders_payment_mode_check`
-- (from 0010). Dropping IF EXISTS then re-adding is safe on existing rows — every
-- existing row is already 'credit' or 'prepaid', both still permitted.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_mode_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_payment_mode_check
  CHECK (payment_mode IN ('credit','prepaid','cash'));
