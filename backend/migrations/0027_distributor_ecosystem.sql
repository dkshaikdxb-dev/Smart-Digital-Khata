-- Distributor / supplier ecosystem (Batch O1) — a lightweight distributor↔shop
-- supply layer that REUSES the existing khata patterns. A distributor is a login
-- user (role='distributor') with a business profile; a shop owner places a
-- purchase order (PO) to a distributor; the distributor prices + fulfils it; on
-- DELIVERY the PO subtotal is posted to a per-(shop,distributor) B2B ledger
-- (shop owes distributor, mirroring the customer-owes-shop khata) and a platform
-- commission is accrued. Money is INTEGER PAISE everywhere, exact.
--
-- ADDITIVE ONLY: existing users/shops/orders/catalog keep working unchanged. The
-- new tables and the widened role CHECK do not touch any existing row.

-- Allow the distributor login role alongside the existing ones.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('owner','staff','admin','distributor'));

-- A distributor's business profile, one per login user.
CREATE TABLE IF NOT EXISTS distributors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  city TEXT, area TEXT,
  categories TEXT[] NOT NULL DEFAULT '{}',
  brands TEXT[] NOT NULL DEFAULT '{}',
  whatsapp TEXT,
  min_order_paise BIGINT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_distributors_city ON distributors(lower(city)) WHERE is_active;

-- A shop's purchase order to a distributor. Linear status pipeline, same shape
-- as the customer order pipeline.
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  distributor_id UUID NOT NULL REFERENCES distributors(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'placed'
    CHECK (status IN ('placed','confirmed','dispatched','delivered','cancelled')),
  note TEXT, subtotal_paise BIGINT NOT NULL DEFAULT 0, placed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_po_shop ON purchase_orders(shop_id, status);
CREATE INDEX IF NOT EXISTS idx_po_dist ON purchase_orders(distributor_id, status);

-- PO line items — snapshot the requested item; the distributor sets the price.
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  catalog_item_id UUID REFERENCES catalog_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL, brand TEXT, pack TEXT, unit TEXT,
  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_price_paise BIGINT NOT NULL DEFAULT 0, line_total_paise BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(po_id);

-- B2B ledger for a (shop, distributor) pair. balance = SUM(CASE WHEN type='supply'
-- THEN amount_paise ELSE -amount_paise END). Positive = shop owes distributor.
CREATE TABLE IF NOT EXISTS supply_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  distributor_id UUID NOT NULL REFERENCES distributors(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('supply','payment')),   -- supply: shop owes more; payment: shop paid
  amount_paise BIGINT NOT NULL CHECK (amount_paise >= 0),
  po_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  method TEXT, note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_supply_ledger_pair ON supply_ledger(shop_id, distributor_id);
CREATE INDEX IF NOT EXISTS idx_supply_ledger_dist ON supply_ledger(distributor_id, created_at DESC);

-- Platform commission accrued on each delivered PO (Lens A monetisation).
CREATE TABLE IF NOT EXISTS supply_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  distributor_id UUID, shop_id UUID,
  gmv_paise BIGINT NOT NULL, rate_bps INTEGER NOT NULL, amount_paise BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'accrued' CHECK (status IN ('accrued','void')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_supply_commissions_po ON supply_commissions(po_id);
