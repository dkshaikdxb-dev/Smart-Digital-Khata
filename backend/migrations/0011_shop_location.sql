-- Shop Discovery (M6) — shops opt into a public directory and set their
-- location so customers can find nearby kiranas to order from. Discovery is a
-- PUBLIC, read-only surface that exposes ONLY shops with is_listed = true and
-- minimal fields (no phones, balances, or owner info).
--
-- latitude/longitude are plain decimal degrees (WGS84); great-circle distance
-- is computed in SQL via the haversine formula (Earth radius 6371 km) at query
-- time, so no PostGIS dependency is required.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS city      TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS area      TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS is_listed BOOLEAN NOT NULL DEFAULT false;

-- Public discovery filters on the opt-in flag first.
CREATE INDEX IF NOT EXISTS idx_shops_is_listed ON shops(is_listed);
