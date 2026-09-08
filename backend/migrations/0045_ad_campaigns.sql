-- Geo-targeted promo system (batch ADS2) — the campaign "matrix" + the
-- marketing admin role. Backend data model + admin CRUD only; NO consumer
-- serving yet (later batch), NO admin UI yet (later batch).
--
-- A campaign is one promo card in one of four styles (A offer, B product,
-- C shop, D festival). ad_targets attach it to a geography: a town (= shop.city),
-- a village, a pincode, or 'all' (everyone). The consumer serving layer (later)
-- matches a shopper's chosen location against these rows.
--
-- Money, where a campaign ever stores a numeric discount, is integer paise; for
-- v1 the offer is just a display string (offer_text, e.g. "₹20 छूट" / "10% off").
--
-- Additive, idempotent, no seed.

-- marketing admin role: extend the users.admin_role CHECK (drop + re-add so this
-- is idempotent). Mirrors the constraint added in 0023_admin_rbac_moderation.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_admin_role_check;
ALTER TABLE users ADD CONSTRAINT users_admin_role_check
  CHECK (admin_role IN ('super','support','finance','moderation','marketing'));

CREATE TABLE IF NOT EXISTS ad_campaigns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  style        TEXT NOT NULL CHECK (style IN ('offer','product','shop','festival')), -- A,B,C,D
  title        TEXT NOT NULL,
  offer_text   TEXT,            -- e.g. "₹20 छूट" / "10% off" (display string)
  subtitle     TEXT,
  glyph        TEXT,            -- emoji/short glyph fallback when no image
  image_url    TEXT,           -- optional; consumer falls back to glyph on low-data
  i18n         JSONB NOT NULL DEFAULT '{}'::jsonb, -- { "<lang>": {title,offer_text,subtitle} } overrides
  advertiser   TEXT,
  link_type    TEXT NOT NULL DEFAULT 'none' CHECK (link_type IN ('none','shop','product','brand','url')),
  link_shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
  link_product_id UUID,        -- soft ref (products table) — no FK to avoid coupling; validate on write
  link_url     TEXT,
  is_seasonal  BOOLEAN NOT NULL DEFAULT false,
  starts_at    TIMESTAMPTZ,
  ends_at      TIMESTAMPTZ,
  priority     INTEGER NOT NULL DEFAULT 0,   -- higher = shown first
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused')),
  impressions  BIGINT NOT NULL DEFAULT 0,
  clicks       BIGINT NOT NULL DEFAULT 0,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ad_targets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  geo_type    TEXT NOT NULL CHECK (geo_type IN ('town','village','pincode','all')),
  geo_value   TEXT,            -- NULL only when geo_type='all'
  UNIQUE (campaign_id, geo_type, geo_value)
);
CREATE INDEX IF NOT EXISTS idx_ad_targets_geo ON ad_targets(geo_type, geo_value);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status ON ad_campaigns(status);
