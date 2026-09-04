-- Customer Accounts + OTP Auth — let a shop's customer log in by phone + a
-- one-time code (OTP over WhatsApp). This is the person who logs in; their
-- link to a shop's `customers` rows is by matching phone at query time, so the
-- existing `customers` table is intentionally left untouched.
CREATE TABLE IF NOT EXISTS customer_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         TEXT NOT NULL UNIQUE,
  name          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- One-time codes for phone login. Only a bcrypt hash of the code is stored,
-- never the plaintext. Short-lived (5 min) with a capped attempt count.
CREATE TABLE IF NOT EXISTS customer_otps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_otps_phone ON customer_otps(phone);
