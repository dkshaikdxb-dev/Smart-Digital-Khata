-- EDIT THE ORDER WHILE ACCEPTING (batch C) — the owner reduces an order at
-- acceptance and the money follows, correctly and auditably.
--
-- The kirana case this exists for: the customer orders six things, the shop has
-- four. Until now the owner's only choices were to accept a wrong order or to
-- cancel the whole thing. This migration adds the state a REDUCTION needs.
--
-- THE THREE RULES THIS SCHEMA ENFORCES OR RECORDS
--
-- 1. REDUCTIONS ONLY. There is deliberately NO column here for an added line or
--    a raised quantity: `order_edits.amount_delta` is documented and written as
--    NEGATIVE paise, always. Inflating a bill after the customer agreed to it is
--    not a feature — it is a way to overcharge a neighbour who cannot check.
--    (The reduction-only rule itself is enforced in the controller, which
--    answers 422 `increase_not_allowed`; the CHECK below is the second rail.)
--
-- 2. THE LEDGER IS APPEND-ONLY. `transactions` has no delete and no edit, by
--    design. So a reduction posts a NEW compensating entry rather than mutating
--    the original order purchase — which is why the `type`/`method` CHECK
--    constraints are widened here with a fourth vocabulary word, 'adjustment'.
--    An adjustment is neither a purchase (it does not increase what is owed) nor
--    a payment (the customer handed over nothing): it is the shop correcting its
--    own bill, and every aggregate in the app that sums `type='purchase'` or
--    `type IN ('cash','upi')` therefore excludes it automatically and stays
--    exactly as correct as it was before this batch.
--
-- 3. EVERY EDIT IS AUDITED, line by line, with who and when — `order_edits`
--    plus `orders.edited_at/edited_by/original_subtotal`.
--
-- ADDITIVE + IDEMPOTENT: every statement is IF NOT EXISTS / DROP … IF EXISTS,
-- so a re-run changes nothing. No existing row is rewritten and no backfill is
-- needed: an order that has never been edited keeps `edited_at`,
-- `edited_by` and `original_subtotal` NULL, which is the honest reading of
-- "nobody has touched this one".

-- ---------------------------------------------------------------------------
-- Ledger vocabulary. 'adjustment' is the FOURTH transaction type; the method of
-- the same name says plainly that no cash, no UPI and no credit changed hands.
-- Dropping and re-adding is how every CHECK widening in this repo is done: it is
-- idempotent, and re-adding validates the existing rows (all of which are
-- 'purchase'/'cash'/'upi', so the validation is a no-op).
-- ---------------------------------------------------------------------------
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('purchase','cash','upi','adjustment'));

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_method_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_method_check
  CHECK (method IN ('cash','upi','credit','razorpay','adjustment'));

-- Which order a ledger row belongs to. NULL for every entry that is not about an
-- order (the manual khata entries, which are most of them). ON DELETE SET NULL
-- because the LEDGER outlives the order: deleting an order must never delete or
-- orphan money history.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tx_order ON transactions (order_id);

-- ---------------------------------------------------------------------------
-- The order side of an edit.
--   edited_at/edited_by  when, and by which owner/staff user. NULL = never edited.
--   original_subtotal    the subtotal BEFORE the FIRST edit, so "was X, now Y"
--                        survives a second and a third edit. Snapshotted once
--                        (COALESCE on write) and never moved again.
-- ---------------------------------------------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS edited_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS original_subtotal BIGINT;

-- ---------------------------------------------------------------------------
-- The line-by-line audit. One row per LINE actually changed by one edit.
--
-- qty_before/qty_after are INT to match `order_items.quantity` EXACTLY (see
-- 0010_orders.sql: `quantity INT NOT NULL CHECK (quantity > 0)`). A weighed line
-- carries its amount in `order_items.weight_grams` with quantity fixed at 1, so
-- for those lines the only reduction available is removal (1 -> 0), which this
-- shape records perfectly.
--
-- order_item_id has NO foreign key on purpose: removing a line DELETES the
-- `order_items` row, and the audit of that removal must outlive it. The `name`
-- column is a snapshot for the same reason — the audit must still read as a
-- sentence when the line it describes is gone.
--
-- client_request_id is the idempotency key (same semantics as
-- transactions.client_request_id, migration 0018): the owner app is used on 2G
-- and a retried edit must apply the money ONCE. It is scoped to the ORDER, not
-- to the shop, so the same key may legitimately be reused across two different
-- orders without one edit being mistaken for the other.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_edits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id UUID,                  -- the line affected (no FK: it may be deleted)
  name          TEXT NOT NULL,         -- snapshot of the line name
  qty_before    INT NOT NULL,
  qty_after     INT NOT NULL,
  amount_delta  BIGINT NOT NULL,       -- paise, NEGATIVE (this is always a reduction)
  edited_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  client_request_id UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- The second rail behind the controller's 422 `increase_not_allowed`: even a
  -- future caller that bypasses the controller cannot write an increase here.
  CONSTRAINT order_edits_reduction_only CHECK (qty_after <= qty_before AND amount_delta <= 0)
);

CREATE INDEX IF NOT EXISTS idx_order_edits_order ON order_edits (order_id);

-- A retried edit can never double-apply: one (order, request, line) at most.
-- Partial, so an edit sent WITHOUT a client_request_id is unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_edits_request
  ON order_edits (order_id, client_request_id, order_item_id)
  WHERE client_request_id IS NOT NULL;
