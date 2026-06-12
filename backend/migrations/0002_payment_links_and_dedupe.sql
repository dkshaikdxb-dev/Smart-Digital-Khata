-- Razorpay Payment Links — store the hosted-link id & URL for the order
ALTER TABLE payment_orders
  ADD COLUMN IF NOT EXISTS provider_link_id  TEXT,
  ADD COLUMN IF NOT EXISTS provider_link_url TEXT;

CREATE INDEX IF NOT EXISTS idx_payment_orders_provider_order
  ON payment_orders(provider_order_id);

CREATE INDEX IF NOT EXISTS idx_payment_orders_provider_link
  ON payment_orders(provider_link_id);

-- Webhook / inbound dedupe — used to swallow duplicates from Razorpay & WhatsApp
CREATE TABLE IF NOT EXISTS processed_events (
  id          TEXT PRIMARY KEY,            -- "razorpay:evt_xxx" or "whatsapp:wamid.xxx"
  channel     TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
