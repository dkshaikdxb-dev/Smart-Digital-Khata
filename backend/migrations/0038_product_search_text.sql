-- Search-recall core (NLQ-A, items 1/2/3/5) — a normalized, all-language search
-- blob per product so consumers can find items typing the local word, English,
-- a romanization, an alias, or a pack size, with fuzzy (trigram) tolerance for
-- noisy speech-to-text. ADDITIVE ONLY: adds one column + one index; English and
-- legacy behaviour is unchanged. Local-first, no runtime services.
--
-- pg_trgm ships with postgres:16-alpine; the extension powers the `%` similarity
-- operator and the GIN trigram index that makes fuzzy matching cheap.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- The normalized, lowercased, space-joined search blob. Nullable and best-effort:
-- an unlinked/legacy row simply gets its own name; consumer search COALESCEs this
-- to products.name so a NULL never breaks matching.
ALTER TABLE products ADD COLUMN IF NOT EXISTS search_text TEXT;

-- One-shot backfill so every existing row is searchable immediately after deploy
-- (deploy runs `migrate` only, not the refresh script). Per product, concatenate
-- (NULL-safe, so unlinked/legacy rows never error):
--   * the product's own name
--   * when catalog_item_id is set: the linked catalog_items product/brand/pack/unit
--   * a simple no-space pack variant (e.g. "1 kg" -> "1kg")
--   * every catalog_i18n name + aliases (ALL languages) for the linked term
-- The richer pack variants (gram/ml equivalents) come from the JS builder in
-- src/utils/search-normalize.js used on the write path; this SQL is the deploy-
-- time baseline. The whole thing is lowercased.
UPDATE products p
SET search_text = lower(concat_ws(' ',
      p.name,
      ci.product,
      ci.brand,
      ci.pack,
      ci.unit,
      replace(ci.pack, ' ', ''),
      (SELECT string_agg(concat_ws(' ', c.name, c.aliases), ' ')
         FROM catalog_i18n c
        WHERE c.term_type = 'product' AND c.term_en = ci.product)
    ))
FROM products p2
LEFT JOIN catalog_items ci ON ci.id = p2.catalog_item_id
WHERE p.id = p2.id;

-- Trigram GIN index: accelerates both ILIKE '%term%' and the `%` similarity
-- operator used by the consumer search recall net.
CREATE INDEX IF NOT EXISTS idx_products_search_text_trgm
  ON products USING gin (search_text gin_trgm_ops);
