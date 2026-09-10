-- Consumer pre-pay / advance balance at a shop (batch WALLET1).
-- Let a customer PRE-PAY a shop (recharge) beyond their current due, building an
-- ADVANCE — a NEGATIVE customers.balance (positive = customer owes; negative =
-- the shop owes the customer). The money settles to that SHOP's OWN Razorpay and
-- is tracked only in that shop's ledger — this is a SINGLE-MERCHANT advance, NOT
-- a platform-held prepaid instrument, so it needs no PPI licence. A general
-- CROSS-SHOP consumer wallet with a platform-held float IS a licensed PPI and is
-- deliberately NOT built here (the same parked, license-gated path as cross-shop
-- Khata Credits).
--
-- NO schema change to customers: balance is already a signed BIGINT (0001_init)
-- with no `>= 0` CHECK, so it can legitimately go negative. The settlement path
-- (webhook.controller) already does `balance = balance - amount` with no clamp,
-- which naturally produces the advance when a customer pre-pays. Money is integer
-- paise throughout. Additive + idempotent.

-- The on/off flag and the per-shop advance ceiling live in platform_settings and
-- are read LIVE at request time (like shopPromo / branded_store), so an admin
-- change takes effect at once. ON CONFLICT DO NOTHING: a one-time seed that never
-- overwrites an operator edit.
--   consumer_prepay_enabled              on/off for the whole feature
--   consumer_prepay_max_advance_paise    largest advance a customer may hold at ONE
--                                         shop, in paise (2000000 = ₹20,000) — a
--                                         sane ceiling so a mistyped recharge can't
--                                         create an absurd advance.
INSERT INTO platform_settings (key, value, updated_at) VALUES
  ('consumer_prepay_enabled', 'true', NOW()),
  ('consumer_prepay_max_advance_paise', '2000000', NOW())
ON CONFLICT (key) DO NOTHING;
