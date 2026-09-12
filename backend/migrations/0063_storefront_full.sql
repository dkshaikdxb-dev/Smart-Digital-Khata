-- "FULL" storefront slider (batch STOREFRONT-FULL) on top of the lightweight
-- photo carousel (0062). Three additive pieces:
--
--   A. MODERATION of owner storefront photos. shop_images gains a review status
--      + the admin's note + when it was reviewed. Existing rows default to
--      'active' so nothing that is live today is ever hidden by this migration.
--      A per-shop trust toggle (shops.slides_auto_publish) lets an admin let a
--      trusted shop's uploads go live without review (default OFF: new uploads
--      start 'pending_review').
--   B. SPONSORED SLOT: an ad_campaign now carries a `placement` — 'discovery'
--      (the existing home-screen band; the default, so every existing campaign
--      keeps serving exactly where it does today) or 'storefront' (at most ONE
--      of these is composed into a shop's storefront slider, geo-matched to the
--      shop's own town/village/pincode).
--   C. BUY-OUT: a shop spends Khata Credits to keep the sponsored slide OFF its
--      storefront for a window (shops.storefront_ad_free_until), priced + gated
--      by platform_settings read LIVE like the Branded Store (0056).
--
-- Additive + idempotent. All money is integer paise.

-- A. shop_images review state. 'active' = shown publicly; 'pending_review' =
-- uploaded, awaiting an admin; 'rejected' = declined (review_note says why).
ALTER TABLE shop_images ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('pending_review','active','rejected'));
ALTER TABLE shop_images ADD COLUMN IF NOT EXISTS review_note TEXT;
ALTER TABLE shop_images ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
-- The admin pending queue + the public "active only" read.
CREATE INDEX IF NOT EXISTS shop_images_status ON shop_images (status);

-- A. Per-shop trust: when true an owner upload is published immediately
-- (status 'active'); when false (default) it waits in 'pending_review'.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS slides_auto_publish BOOLEAN NOT NULL DEFAULT false;

-- B. Where a campaign serves. Default 'discovery' keeps every existing row on
-- the home-screen band; only campaigns explicitly built for the storefront slot
-- are ever composed into a shop page.
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS placement TEXT NOT NULL DEFAULT 'discovery'
  CHECK (placement IN ('discovery','storefront'));
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_placement_status ON ad_campaigns (placement, status);

-- C. The storefront is ad-free (no sponsored slide composed) while
-- storefront_ad_free_until > NOW(). NULL = never bought.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS storefront_ad_free_until TIMESTAMPTZ;

-- C. Pricing + the on/off flag live in platform_settings, read LIVE at request
-- time (like the Branded Store) so an admin change takes effect at once.
-- ON CONFLICT DO NOTHING: a one-time seed that never overwrites an operator edit.
--   storefront_ad_free_enabled                on/off for the buy-out
--   storefront_ad_free_credits_per_day_paise  price per day in paise (500 = ₹5/day)
--   storefront_ad_free_max_days               longest window a shop may buy in one go
INSERT INTO platform_settings (key, value, updated_at) VALUES
  ('storefront_ad_free_enabled', 'true', NOW()),
  ('storefront_ad_free_credits_per_day_paise', '500', NOW()),
  ('storefront_ad_free_max_days', '30', NOW())
ON CONFLICT (key) DO NOTHING;
