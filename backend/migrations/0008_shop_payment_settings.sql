-- Per-Shop Razorpay (M4) — each shop connects THEIR OWN Razorpay account so
-- customer payments settle directly to that shop. The platform Razorpay account
-- (platform_settings) stays ONLY for subscription billing (Pro/Family).
--
-- Per-shop keys live here under keys:
--   RZP_KEY_ID, RZP_KEY_SECRET, RZP_WEBHOOK_SECRET, RZP_WEBHOOK_TOKEN
-- RZP_WEBHOOK_TOKEN is an opaque 32-hex value (auto-generated on first save)
-- used to build the shop's unique webhook URL.
CREATE TABLE IF NOT EXISTS shop_settings (
  shop_id    UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (shop_id, key)
);

-- Fast reverse lookup: resolve a shop from its webhook token (WHERE key='RZP_WEBHOOK_TOKEN').
CREATE INDEX IF NOT EXISTS idx_shop_settings_value ON shop_settings(key, value);
