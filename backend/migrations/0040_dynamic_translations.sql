-- Dynamic-content translation cache (v2 item 9). A durable, cache-first store so
-- a given GENUINELY DYNAMIC string (owner notes, ad-hoc messages — NOT the static
-- UI in admin-dashboard/src/lib/i18n.js and NOT the catalogue in catalog_i18n,
-- both of which are build-time and DONE) is machine-translated at most once per
-- target language. The cache read is a single indexed SELECT+UPDATE and is the
-- ONLY path that ever runs on a warm request; even so it is deliberately kept OFF
-- the product-search hot path.
--
-- `provider` records what produced `translated`: 'bhashini' (neural MT via the
-- off-by-default seam), or 'fallback' (English/source echoed because the seam is
-- disabled or returned nothing — cached as a negative result so hot requests do
-- not retry). Machine output lands with needs_review=true; hit_count lets an admin
-- surface the most-repeated strings for human review first.
--
-- Additive + idempotent: CREATE ... IF NOT EXISTS, no seed.

CREATE TABLE IF NOT EXISTS dynamic_translations (
  source_hash   text NOT NULL,   -- hash of normalized source text (sha256 hex)
  source_lang   text NOT NULL DEFAULT 'en',
  target_lang   text NOT NULL,
  source_text   text NOT NULL,
  translated    text NOT NULL,
  provider      text NOT NULL,   -- 'cache' | 'bhashini' | 'fallback' (which produced `translated`)
  needs_review  boolean NOT NULL DEFAULT true,   -- machine output awaits human review
  hit_count     integer NOT NULL DEFAULT 0,      -- how often served → surfaces frequent strings for human review
  created_at    timestamptz NOT NULL DEFAULT NOW(),
  updated_at    timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source_hash, target_lang)
);

CREATE INDEX IF NOT EXISTS idx_dyn_tx_review_freq ON dynamic_translations (needs_review, hit_count DESC);
