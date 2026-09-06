-- Fresh Produce / farmer supplier flavour (Batch F1) — an ADDITIVE tweak on top
-- of the O1 distributor ecosystem (0027). A "farmer" is just a distributor whose
-- kind = 'farmer' and whose category is Fresh Produce; it reuses the ENTIRE PO /
-- ledger / commission pipeline verbatim. This migration only adds a kind flag +
-- an optional village to the distributors profile. No new table, no data touched.
--
-- The Fresh-Produce commission rate lives in platform_settings under key
-- SUPPLY_COMMISSION_FRESH_BPS and is read in code with a fallback of 0 (farmers
-- pay nothing at launch) — deliberately NOT seeded here.

ALTER TABLE distributors ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'distributor';
ALTER TABLE distributors DROP CONSTRAINT IF EXISTS distributors_kind_check;
ALTER TABLE distributors ADD CONSTRAINT distributors_kind_check CHECK (kind IN ('distributor','farmer'));
ALTER TABLE distributors ADD COLUMN IF NOT EXISTS village TEXT;
CREATE INDEX IF NOT EXISTS idx_distributors_kind ON distributors(kind) WHERE is_active;
