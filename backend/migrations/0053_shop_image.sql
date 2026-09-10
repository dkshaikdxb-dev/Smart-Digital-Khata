-- Shop cover image — store a single shop cover/photo IN Postgres (not on disk),
-- mirroring exactly how product photos are stored (batch 0012): the bytes live in
-- a BYTEA column on the row, served under /api with a cache-busted pointer in
-- image_url. Owners upload one wide cover per shop, resized/compressed
-- client-side (ImageStudio) with the server sharp pipeline as the backstop.
-- Additive + idempotent.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS image_url        TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS image_mime       TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS image_data       BYTEA;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS image_updated_at TIMESTAMPTZ;
