-- Storefront photo gallery — up to 3 owner-uploaded shop photos, stored IN
-- Postgres (not on disk) exactly like the single shop cover (migration 0053):
-- the processed WebP bytes live in a BYTEA column on the row, served under
-- /api/shop-images/<id> with a cache-busted ?v= pointer. The existing single
-- cover on `shops` (image_url/image_data/…) stays for backward-compat and is the
-- legacy fallback when a shop has no shop_images rows yet.
--
-- The max of 3 photos/shop is enforced in the app (a 4th upload → 409), NOT in
-- the DB. Additive + idempotent.
CREATE TABLE IF NOT EXISTS shop_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  position    INT  NOT NULL DEFAULT 0,
  mime        TEXT NOT NULL,
  data        BYTEA NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS shop_images_shop_pos ON shop_images (shop_id, position);
