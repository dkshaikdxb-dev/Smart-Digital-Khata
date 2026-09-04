-- Product Images — store a single product photo IN Postgres (not on disk) so no
-- Docker volume or nginx change is needed; it is served under /api. Owners upload
-- one photo per product, resized/compressed server-side for weak rural networks.
-- Additive + idempotent. The existing image_url column is kept: it may hold an
-- external URL OR a cache-busted pointer at the serve endpoint (see controller).
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_data       BYTEA;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_mime       TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_updated_at TIMESTAMPTZ;
