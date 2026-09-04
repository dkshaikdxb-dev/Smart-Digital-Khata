-- Orders / commerce (M5b) — customers order from a shop's catalog. An order is
-- either CREDIT (added to the customer's khata) or PREPAID (paid online to the
-- shop's own Razorpay). Fulfillment is delivery or pickup. Money is integer paise.
--
-- Line items SNAPSHOT the product name + unit price at order time, so a product
-- can later be edited or hard-deleted (product_id → NULL) without corrupting
-- past order history. All amounts are integer paise, like the rest of the app.
CREATE TABLE IF NOT EXISTS orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id          UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id      UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','accepted','preparing','ready','out_for_delivery','completed','cancelled')),
  fulfillment_type TEXT NOT NULL CHECK (fulfillment_type IN ('delivery','pickup')),
  payment_mode     TEXT NOT NULL CHECK (payment_mode IN ('credit','prepaid')),
  payment_status   TEXT NOT NULL DEFAULT 'not_required'
                     CHECK (payment_status IN ('not_required','pending','paid')),
  subtotal         BIGINT NOT NULL DEFAULT 0, -- paise
  address          TEXT,
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES products(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,   -- snapshot of product name at order time
  unit_price  BIGINT NOT NULL, -- snapshot of product price (paise) at order time
  quantity    INT NOT NULL CHECK (quantity > 0),
  line_total  BIGINT NOT NULL  -- unit_price * quantity (paise)
);

-- Link a prepaid payment_orders row to the order it settles. When set, the
-- webhook settles the ORDER (marks it paid) instead of crediting the khata.
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_shop_status ON orders(shop_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
