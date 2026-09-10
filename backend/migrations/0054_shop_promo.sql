-- Shop self-serve promo placement paid with Khata Credits (batch PROMO-BUY).
-- Closes the closed-loop credit circulation: a shop spends earned Khata Credits
-- to buy a promo placement advertising its own store in the geo-marketplace.
--
-- Shop-created promos are MODERATED: they start 'pending_review' and only serve
-- after an admin approves them (serving in promos.controller filters status =
-- 'active'). Credits are debited in the SAME transaction as the campaign insert
-- (guarded, balance can never go negative) and refunded once on rejection.
--
-- Reuses ad_campaigns / ad_targets (0045) + utils/wallet.spendCredits (R3).
-- Additive + idempotent. All money is integer paise.

-- Widen the campaign status CHECK to add the two review states. Drop + re-add so
-- this is idempotent. 'pending_review' = a shop bought it and it awaits admin
-- moderation; 'rejected' = an admin declined it (and the credits were refunded).
ALTER TABLE ad_campaigns DROP CONSTRAINT IF EXISTS ad_campaigns_status_check;
ALTER TABLE ad_campaigns ADD CONSTRAINT ad_campaigns_status_check
  CHECK (status IN ('draft','active','paused','pending_review','rejected'));

-- Mark a campaign a shop bought for itself (vs. an admin-authored campaign) and
-- record what the shop paid, in paise, so a rejection can refund the exact amount.
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS self_serve BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS credits_spent_paise BIGINT;

-- Self-serve pricing + the on/off flag live in platform_settings, read LIVE at
-- request time (like the enrolment fee) so an admin change takes effect at once.
-- ON CONFLICT DO NOTHING: a one-time seed that never overwrites an operator edit.
--   shop_promo_enabled                on/off for the whole self-serve flow
--   shop_promo_credits_per_day_paise  price per day in paise (1000 = ₹10/day)
--   shop_promo_max_days               longest window a shop may buy in one go
INSERT INTO platform_settings (key, value, updated_at) VALUES
  ('shop_promo_enabled', 'true', NOW()),
  ('shop_promo_credits_per_day_paise', '1000', NOW()),
  ('shop_promo_max_days', '30', NOW())
ON CONFLICT (key) DO NOTHING;

-- Fast lookup of a shop's own placements + the admin pending-review queue.
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_selfserve ON ad_campaigns(self_serve, status);
