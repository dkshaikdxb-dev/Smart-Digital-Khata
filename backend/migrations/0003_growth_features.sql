-- Tier 1 growth features: recurring billing, customer self-view,
-- per-customer notification opt-out, owner daily digest.

-- Subscriptions: real Razorpay lifecycle states + authorization URL
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('pending','active','cancelled','past_due','halted'));
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS provider_short_url TEXT;
CREATE INDEX IF NOT EXISTS idx_subs_provider_sub
  ON subscriptions(provider_subscription_id);

-- Customers: notification opt-out + shareable read-only khata token
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS share_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_share_token
  ON customers(share_token) WHERE share_token IS NOT NULL;

-- Shops: owner's end-of-day WhatsApp digest
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS daily_digest BOOLEAN NOT NULL DEFAULT true;
