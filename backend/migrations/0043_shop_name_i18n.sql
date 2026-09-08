-- Native-language shop NAME localization (batch SHOPNAME). The customer-facing
-- app localizes catalogue names, categories and UI strings, but a shop's own
-- NAME stayed English while everything around it was native — visibly out of
-- sync. This table stores a per-language rendering of each shop's name so
-- discovery (getShop / listShops / product search) can COALESCE a localized
-- name with the raw English one as the fallback.
--
-- Rows are auto-seeded on signup and on owner rename (source='auto'); an owner
-- can override any language from the dashboard (source='owner'), which the
-- re-seed path never clobbers. needs_review flags an auto row that required
-- best-effort transliteration of a proper-noun token, so a human can verify it.
--
-- Additive, idempotent, no seed (existing shops are filled by the
-- `backfill:shop-name-i18n` script post-deploy). Matches the migrate runner's
-- plain-SQL + IF NOT EXISTS convention.

CREATE TABLE IF NOT EXISTS shop_name_i18n (
  shop_id     UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  lang        TEXT NOT NULL,
  name        TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'auto',   -- 'auto' | 'owner'
  needs_review BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (shop_id, lang)
);
