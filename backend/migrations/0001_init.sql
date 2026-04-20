-- Smart Digital Khata — initial schema
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','staff','admin')),
  shop_id       UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

CREATE TABLE IF NOT EXISTS shops (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  notification_mode     TEXT NOT NULL DEFAULT 'smart' CHECK (notification_mode IN ('silent','smart','active')),
  plan                  TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','family')),
  default_credit_limit  BIGINT NOT NULL DEFAULT 0,  -- paise
  timezone              TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE users
  ADD CONSTRAINT users_shop_fk FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS customers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  credit_limit  BIGINT NOT NULL DEFAULT 0, -- paise
  balance       BIGINT NOT NULL DEFAULT 0, -- paise (positive = customer owes shop)
  notes         TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shop_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_customers_shop ON customers(shop_id);

CREATE TABLE IF NOT EXISTS transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('purchase','cash','upi')),
  amount      BIGINT NOT NULL, -- paise, positive
  method      TEXT NOT NULL DEFAULT 'credit' CHECK (method IN ('cash','upi','credit','razorpay')),
  note        TEXT,
  source      TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','whatsapp','razorpay','api')),
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tx_shop_created ON transactions(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_customer ON transactions(customer_id);

CREATE TABLE IF NOT EXISTS payment_orders (
  id                  TEXT PRIMARY KEY,          -- short receipt id
  shop_id             UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  customer_id         UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount              BIGINT NOT NULL,           -- paise
  currency            TEXT NOT NULL DEFAULT 'INR',
  status              TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','paid','failed','cancelled')),
  provider            TEXT NOT NULL DEFAULT 'razorpay',
  provider_order_id   TEXT,
  provider_payment_id TEXT,
  notes               TEXT,
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_orders_shop ON payment_orders(shop_id);

CREATE TABLE IF NOT EXISTS subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  plan          TEXT NOT NULL CHECK (plan IN ('free','pro','family')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','past_due')),
  amount        BIGINT NOT NULL DEFAULT 0, -- paise
  currency      TEXT NOT NULL DEFAULT 'INR',
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at  TIMESTAMPTZ,
  provider      TEXT DEFAULT 'razorpay',
  provider_subscription_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_subs_shop ON subscriptions(shop_id);

CREATE TABLE IF NOT EXISTS notification_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     UUID REFERENCES shops(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL DEFAULT 'whatsapp',
  kind        TEXT NOT NULL,   -- 'transaction','reminder','receipt'
  payload     JSONB,
  status      TEXT NOT NULL DEFAULT 'sent',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
