-- ONE-TAP ACCEPT with a coarse ready-time promise (batch B).
--
-- Accepting an order today is a bare status change: the customer is told the
-- order "is now accepted" and has no idea when to come. This migration adds the
-- three columns that carry the PROMISE the owner makes with that one tap:
--
--   orders.eta_minutes  the chip the owner tapped (15 / 30 / 60 by default).
--                       NULL = the owner accepted without promising a time,
--                       which is a legitimate answer and NEVER invented for them.
--   orders.promised_at  the absolute instant that chip resolves to. Stored as an
--                       INSTANT, not a duration, because the customer reads the
--                       message ten minutes later: "in 30 minutes" rots, a clock
--                       time does not. Every surface renders THIS.
--   orders.eta_set_at   when the promise was last made or re-made. "Need more
--                       time" recomputes promised_at from NOW and moves this, so
--                       the two together say "promised X, as of Y".
--
-- Deliberately NOT added: any "late" flag. Lateness is derived by each client
-- from promised_at vs the clock, so no job has to keep a column honest and an
-- offline client still reads the same truth.
--
-- ADDITIVE + IDEMPOTENT: every statement is IF NOT EXISTS / ON CONFLICT, so a
-- re-run changes nothing. EXISTING orders keep all three NULL — no promise was
-- ever made on them, and a backfill would be inventing one.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS eta_minutes INT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promised_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS eta_set_at  TIMESTAMPTZ;

-- Platform settings, read LIVE (never cached, never throwing) by
-- utils/orderEta.js in the same style as getOrderAlertBounds()/getShopHoursConfig():
--   order_eta_chips        the THREE coarse chips the owner sees, as a
--                          comma-separated minute list. Coarse on purpose: a
--                          kirana owner is not dispatching riders, and a
--                          minute-precise promise would be false precision.
--                          1..4 entries; the helper parses, validates, de-dupes
--                          and sorts, and falls back to 15/30/60 on anything
--                          malformed rather than throwing.
--   order_eta_max_minutes  the ceiling a requested eta is clamped to, so a
--                          fat-fingered value can never promise next week.
-- ON CONFLICT DO NOTHING: a one-time seed that never overwrites an operator edit.
INSERT INTO platform_settings (key, value, updated_at) VALUES
  ('order_eta_chips', '15,30,60', NOW()),
  ('order_eta_max_minutes', '240', NOW())
ON CONFLICT (key) DO NOTHING;
