-- Shop Catalog (M5a) — products a kirana lists so customers can browse and
-- (next milestone) order. Prices are integer paise, like the rest of the app.
-- A future order_items table will snapshot name/price per order, so a product
-- can be hard-deleted here without corrupting past order history.
CREATE TABLE IF NOT EXISTS products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  price       BIGINT NOT NULL DEFAULT 0,      -- paise
  unit        TEXT NOT NULL DEFAULT 'unit',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  image_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Catalog listing + public browse both filter by shop and active flag.
CREATE INDEX IF NOT EXISTS idx_products_shop_active ON products(shop_id, is_active);
