-- 0059_delivery_champions.sql (batch DELIV1)
-- The last-mile DELIVERY CHAMPION layer on TOP of the existing shop-run home
-- delivery (orders.fulfillment_type='delivery', the 'out_for_delivery' status,
-- shops.offers_delivery/delivery_fee/free_delivery_min — all pre-existing and
-- UNCHANGED here). A Delivery Champion is a delivery agent the owner registers
-- for their shop (like a Khata Mitra, but for last-mile) and ASSIGNS a delivery
-- order to. The champion then works the order to picked_up -> delivered through a
-- NO-LOGIN token link (mirrors the customer khata /khata/:token pattern: a random
-- stored access_token IS the credential, never a guessable id), earning a
-- per-delivery incentive that is only TRACKED here — settlement (paying the
-- champion) is out of scope for this batch.
--
-- Additive + idempotent. All money is integer paise.

CREATE TABLE IF NOT EXISTS delivery_champions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,   -- the shop that registered this champion
  name          TEXT NOT NULL,
  phone         TEXT,
  area          TEXT,                                                    -- free text (locality/pincode note)
  is_active     BOOLEAN NOT NULL DEFAULT true,
  access_token  TEXT UNIQUE NOT NULL,                                    -- random, for the no-login champion link
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_champions_shop ON delivery_champions(shop_id);

CREATE TABLE IF NOT EXISTS deliveries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  champion_id   UUID NOT NULL REFERENCES delivery_champions(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'assigned'
                CHECK (status IN ('assigned','picked_up','delivered','cancelled')),
  fee_paise     BIGINT NOT NULL DEFAULT 0,     -- the champion's incentive for this delivery (tracked; settlement is out of scope)
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  picked_up_at  TIMESTAMPTZ,
  delivered_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_deliveries_champion ON deliveries(champion_id, status);

-- Default per-delivery incentive (₹20). The owner may override it per assignment
-- (POST /api/delivery/assign { fee_paise? }). ON CONFLICT DO NOTHING so a later
-- operator edit is never clobbered.
INSERT INTO platform_settings (key, value, updated_at) VALUES
  ('delivery_champion_fee_paise', '2000', NOW())
ON CONFLICT (key) DO NOTHING;
