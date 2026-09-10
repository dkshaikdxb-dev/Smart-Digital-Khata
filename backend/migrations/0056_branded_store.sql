-- Premium "Branded Store" — a credit-unlocked storefront theme (batch STORE1).
-- A shop spends its earned Khata Credits to unlock, for a time-boxed window, a
-- custom accent colour + tagline on its public storefront, a "Premium" badge, and
-- a small priority bump for its self-serve promos. Another closed-loop credit sink:
-- the spend is a guarded debit on the shop's wallet in the SAME transaction as the
-- branded_until extension (balance can never go negative), and there is NO cash.
--
-- Reuses shops (0044/0053), utils/wallet.spendCredits (R3, purpose 'redeem_premium'
-- is already an allowed spend kind), and the ad_campaigns.priority column (0045).
-- Additive + idempotent. All money is integer paise.

-- Premium is active while branded_until > NOW(). brand_accent is a #RRGGBB hex the
-- storefront tints its header with; brand_tagline is a short line under the shop
-- name. All three are nullable and only ever surfaced publicly while branded.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS branded_until TIMESTAMPTZ;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS brand_accent TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS brand_tagline TEXT;

-- Pricing + the on/off flag live in platform_settings, read LIVE at request time
-- (like the self-serve promo config) so an admin change takes effect at once.
-- ON CONFLICT DO NOTHING: a one-time seed that never overwrites an operator edit.
--   branded_store_enabled                 on/off for the whole feature
--   branded_store_credits_per_day_paise   price per day in paise (2000 = ₹20/day)
--   branded_store_max_days                longest window a shop may buy in one go
INSERT INTO platform_settings (key, value, updated_at) VALUES
  ('branded_store_enabled', 'true', NOW()),
  ('branded_store_credits_per_day_paise', '2000', NOW()),
  ('branded_store_max_days', '90', NOW())
ON CONFLICT (key) DO NOTHING;
