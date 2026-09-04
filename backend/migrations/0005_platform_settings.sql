-- Platform settings editable from the admin UI (Razorpay keys, etc.).
-- Values read at runtime by config/settings.js, with .env as fallback.
CREATE TABLE IF NOT EXISTS platform_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
