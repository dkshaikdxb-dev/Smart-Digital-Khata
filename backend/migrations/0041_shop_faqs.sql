-- Owner-authored per-store FAQ (Batch FAQ-2). A shop owner writes questions +
-- answers/policies for THEIR store; customers see each of their shops' active
-- FAQ on the consumer account page. ADDITIVE ONLY: one new table + one index,
-- idempotent, no seed. Local-first, no runtime services.
CREATE TABLE IF NOT EXISTS shop_faqs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  sort_order  INT  NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Serves both the owner editor (this shop's rows, any is_active) and the
-- consumer read (active rows for a shop, ordered by sort_order).
CREATE INDEX IF NOT EXISTS idx_shop_faqs_shop_active ON shop_faqs (shop_id, is_active, sort_order);
