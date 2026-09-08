-- Location foundation (batch LOC1) — the geo model that later batches
-- (campaigns, serving, slider) target against. NO ads yet.
--
-- Shops already carry city/area/latitude/longitude from discovery (M6). We
-- treat city = town; add pincode + village so a shop can be located at the
-- village/PIN granularity that rural targeting needs.
--
-- The GLOBAL consumer identity is customer_users (phone-keyed, migration 0007).
-- The shopper's CHOSEN location lives here, not on any per-shop customers row
-- (that is a ledger row, not the consumer). town ≈ shop.city.
--
-- Additive, idempotent, no seed. Existing shops keep NULL pincode/village until
-- owners fill them in; new signups/edits capture them going forward.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS pincode TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS village TEXT;

ALTER TABLE customer_users ADD COLUMN IF NOT EXISTS town    TEXT;   -- the shopper's chosen town (≈ shop.city)
ALTER TABLE customer_users ADD COLUMN IF NOT EXISTS village TEXT;
ALTER TABLE customer_users ADD COLUMN IF NOT EXISTS pincode TEXT;
