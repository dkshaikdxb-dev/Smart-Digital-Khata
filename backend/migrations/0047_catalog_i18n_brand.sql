-- Brand-name localization (batch LOC-BRAND) — allow `catalog_i18n` to carry
-- brand translations (term_type='brand'), so discovery can render brand names
-- in native scripts instead of raw English. ADDITIVE + IDEMPOTENT: it only
-- widens the existing term_type CHECK to include 'brand'; no data changes here
-- (the brand rows ship in src/data/catalog-i18n.json and load via the
-- `Import catalog translations` workflow / import-catalog-i18n.js). Existing
-- product/category/subcategory rows are untouched, and the English API path is
-- unchanged (the brand LEFT JOIN only fires when ?lang != en).
ALTER TABLE catalog_i18n DROP CONSTRAINT IF EXISTS catalog_i18n_term_type_check;
ALTER TABLE catalog_i18n ADD CONSTRAINT catalog_i18n_term_type_check
  CHECK (term_type IN ('product','category','subcategory','brand'));
