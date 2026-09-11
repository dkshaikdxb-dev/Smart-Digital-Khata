-- Free owner promo requests + a review note on moderation (batch PROMO free).
--
-- Two additions on top of the paid self-serve promo flow (0054):
--   1. A FREE request path — a shop asks for a promo at NO Khata-Credit cost. It
--      never touches the wallet (credits_spent_paise = 0), is admin-moderated the
--      same way as a paid one (starts 'pending_review'), gated by its own flag and
--      throttled to a small per-shop cap so it cannot be abused.
--   2. review_note — the admin's optional reject/approve note, shown to the owner
--      on their placement so a rejection can explain itself.
--
-- Additive + idempotent. All money stays integer paise; the free path spends none.

-- The admin's moderation note (reject reason / approval note), surfaced to the
-- owner on their own placement. NULL until an admin writes one.
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS review_note TEXT;

-- Free-path settings live in platform_settings, read LIVE at request time like the
-- paid pricing (0054). ON CONFLICT DO NOTHING: a one-time seed that never
-- overwrites an operator edit.
--   shop_promo_free_enabled     on/off for the free request path
--   shop_promo_free_max_days    longest window a free request may ask for (clamped)
--   shop_promo_free_max_active  max concurrent pending+active free promos per shop
INSERT INTO platform_settings (key, value, updated_at) VALUES
  ('shop_promo_free_enabled', 'true', NOW()),
  ('shop_promo_free_max_days', '7', NOW()),
  ('shop_promo_free_max_active', '1', NOW())
ON CONFLICT (key) DO NOTHING;
