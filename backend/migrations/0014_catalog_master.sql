-- Shared master product catalog (M6) — a single BASE catalog every shop can
-- browse and "select" items from at its OWN price. Each shop's existing
-- per-shop `products` row represents ONE item that shop carries; it may link
-- back to a base catalog item via the new nullable `products.catalog_item_id`.
--
-- ADDITIVE ONLY: existing products / order_items / discovery / the customer
-- catalog keep working unchanged. `catalog_item_id` is nullable, so legacy and
-- hand-entered products (with no base link) are unaffected.
--
-- Seed rows have an `sku` (UNIQUE) and are is_global. Custom items owned by one
-- shop have no sku, carry created_by_shop_id, and are is_global by default so
-- they join the shared base for everyone.
CREATE TABLE IF NOT EXISTS catalog_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku                TEXT UNIQUE,                       -- nullable: custom items have none
  category           TEXT,
  subcategory        TEXT,
  product            TEXT NOT NULL,
  brand              TEXT,
  pack               TEXT,
  unit               TEXT,
  indicative_price   BIGINT NOT NULL DEFAULT 0,         -- paise
  perishable         BOOLEAN NOT NULL DEFAULT false,
  created_by_shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
  is_global          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Category filter UI.
CREATE INDEX IF NOT EXISTS idx_catalog_items_category ON catalog_items(category);
-- Name search / stable keyset ordering by product name (no pg_trgm needed).
CREATE INDEX IF NOT EXISTS idx_catalog_items_lower_product ON catalog_items(lower(product));

-- Link a per-shop product back to the base catalog item it was selected from.
-- Nullable: legacy / custom-entered products keep working with no link.
ALTER TABLE products ADD COLUMN IF NOT EXISTS catalog_item_id UUID REFERENCES catalog_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_catalog_item ON products(catalog_item_id);
