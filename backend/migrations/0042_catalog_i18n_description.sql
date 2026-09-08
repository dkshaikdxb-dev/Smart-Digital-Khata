-- Product-description localization (batch DESCLOC) — a per-language description
-- on the master catalog term, so a linked/matching product shows its localized
-- description instead of the raw English one. ADDITIVE + IDEMPOTENT: adds one
-- nullable column; rows with no translated description simply keep it NULL and
-- the API falls back to products.description. Local-first, no runtime services,
-- no seed here (the data ships in src/data/catalog-i18n.json and loads via the
-- `Import catalog translations` workflow / import-catalog-i18n.js).
ALTER TABLE catalog_i18n ADD COLUMN IF NOT EXISTS description TEXT;
