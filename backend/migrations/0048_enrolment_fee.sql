-- 0048_enrolment_fee.sql
-- One-time shop enrolment fee foundation (dormant behind a flag).
-- Additive + idempotent. All amounts are integer paise.
-- The feature ships OFF: enrolment_fee_enabled defaults to 'false', so signup
-- stays free and nothing charges any shop until an admin flips the flag.

CREATE TABLE IF NOT EXISTS enrolments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id           UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  tier              TEXT NOT NULL CHECK (tier IN ('basic','premium')),
  amount_paise      BIGINT NOT NULL CHECK (amount_paise >= 0),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded')),
  provider          TEXT NOT NULL DEFAULT 'razorpay',            -- 'razorpay' | 'manual'
  provider_order_id TEXT,
  provider_payment_id TEXT,
  -- split snapshot (percent, integer) captured at payment time so later rate
  -- changes never retro-alter what was owed to the chain. buffer = 100-infra-l1-l2.
  split_infra_pct   INT,
  split_l1_pct      INT,
  split_l2_pct      INT,
  paid_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- At most ONE paid enrolment per shop (a shop enrols once). Pending/failed rows may repeat.
CREATE UNIQUE INDEX IF NOT EXISTS uq_enrolment_paid ON enrolments(shop_id) WHERE status = 'paid';
CREATE INDEX IF NOT EXISTS idx_enrolment_shop ON enrolments(shop_id);
CREATE INDEX IF NOT EXISTS idx_enrolment_order ON enrolments(provider_order_id);

-- Feature flag OFF + default amounts + default split. Integer paise as text, like the reward rule.
INSERT INTO platform_settings (key, value, updated_at) VALUES
  ('enrolment_fee_enabled',       'false', NOW()),
  ('enrolment_fee_basic_paise',   '9900',  NOW()),   -- ₹99
  ('enrolment_fee_premium_paise', '19900', NOW()),   -- ₹199
  ('referral_split_infra_pct',    '50',    NOW()),
  ('referral_split_l1_pct',       '30',    NOW()),
  ('referral_split_l2_pct',       '15',    NOW())
ON CONFLICT (key) DO NOTHING;   -- DO NOTHING: never clobber an admin's later edits
