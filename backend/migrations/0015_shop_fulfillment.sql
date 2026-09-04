-- Per-shop FULFILLMENT settings (M7) — each shop decides whether it offers
-- pickup and/or delivery, its flat delivery fee, an optional free-delivery
-- threshold, a minimum subtotal required to place a DELIVERY order, plus a
-- couple of informational fields (radius, hours). The customer order flow
-- honours these: mode availability, min-order gate, and the delivery fee that
-- is charged on top of the subtotal (prepaid amount and khata credit alike).
--
-- ADDITIVE + IDEMPOTENT: all columns are ADD COLUMN IF NOT EXISTS with safe
-- defaults, so existing shops/orders keep working unchanged. All money is
-- integer paise, like the rest of the app.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS offers_pickup      BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS offers_delivery    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS delivery_fee       BIGINT  NOT NULL DEFAULT 0;   -- paise, flat
ALTER TABLE shops ADD COLUMN IF NOT EXISTS free_delivery_min  BIGINT;                         -- paise, nullable: subtotal >= it => free delivery
ALTER TABLE shops ADD COLUMN IF NOT EXISTS delivery_min_order BIGINT  NOT NULL DEFAULT 0;   -- paise: minimum subtotal for a DELIVERY order
ALTER TABLE shops ADD COLUMN IF NOT EXISTS delivery_radius_km NUMERIC(5,1);                   -- nullable, informational
ALTER TABLE shops ADD COLUMN IF NOT EXISTS delivery_hours     TEXT;                           -- nullable, free text e.g. "9 AM - 8 PM"

-- The delivery fee actually charged on an order, snapshotted at order time.
-- Existing orders default 0 (pickup / pre-fulfillment orders) — unchanged.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee BIGINT NOT NULL DEFAULT 0; -- paise
