-- Family Payments — group several of a shop's customers under one shared
-- credit line with a designated payer and optional per-member sub-limits.
CREATE TABLE IF NOT EXISTS families (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id           UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  credit_limit      BIGINT NOT NULL DEFAULT 0, -- paise (0 = unlimited)
  payer_customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_families_shop ON families(shop_id);

-- Link customers to a family and give each an optional cap within it.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES families(id) ON DELETE SET NULL;
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS family_sub_limit BIGINT; -- paise; NULL = no member cap
CREATE INDEX IF NOT EXISTS idx_customers_family ON customers(family_id);
