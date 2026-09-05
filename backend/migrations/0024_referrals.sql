-- Referrals / onboarding-source attribution (Phase D). Additive and idempotent
-- so it is safe to re-run. Tracks who referred a new signup, keeps the chain
-- visible to participants, and accrues (never pays out) a configurable reward.
-- Money is integer paise. A missing/invalid referral code never blocks a signup.

-- A shareable code owned by ANY actor: a system user (owner/staff), a consumer,
-- or an external influencer/other that has no system account (then only label
-- is set). The code is short and ambiguity-free (e.g. RK9F2A).
CREATE TABLE IF NOT EXISTS referral_codes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              TEXT UNIQUE NOT NULL,            -- short, shareable (e.g. RK9F2A)
  owner_type        TEXT NOT NULL CHECK (owner_type IN ('customer','owner','staff','influencer','other')),
  owner_user_id     UUID,                            -- users.id for owner/staff
  owner_customer_id UUID,                            -- customer_users.id for a consumer
  label             TEXT,                            -- display name (esp. influencer/other)
  created_by        UUID,                            -- admin/user who created it
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refcode_owner_user ON referral_codes(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_refcode_owner_cust ON referral_codes(owner_customer_id);

-- One attribution row per new signup that arrived via a code.
CREATE TABLE IF NOT EXISTS referrals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code_id    UUID REFERENCES referral_codes(id) ON DELETE SET NULL,
  code                TEXT,                          -- snapshot of the code used
  referred_type       TEXT NOT NULL CHECK (referred_type IN ('shop','owner','customer')),
  referred_user_id    UUID,                          -- new users.id (owner signup)
  referred_shop_id    UUID,                          -- new shop
  referred_customer_id UUID,                         -- new customer_users.id
  source_channel      TEXT,                          -- optional freeform: whatsapp|poster|field|word_of_mouth|...
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ref_code_id ON referrals(referral_code_id);
-- One attribution per referred principal (idempotent capture).
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_user ON referrals(referred_user_id) WHERE referred_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_cust ON referrals(referred_customer_id) WHERE referred_customer_id IS NOT NULL;

-- Reward accrual scaffolding (NO payout engine): a row per referral when the
-- rule is enabled. status stays 'accrued' unless an admin voids it later.
CREATE TABLE IF NOT EXISTS referral_rewards (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id      UUID REFERENCES referrals(id) ON DELETE CASCADE,
  beneficiary_code_id UUID REFERENCES referral_codes(id) ON DELETE SET NULL,
  kind             TEXT NOT NULL DEFAULT 'referral',
  amount_paise     BIGINT NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'accrued' CHECK (status IN ('accrued','void')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reward_referral ON referral_rewards(referral_id);
CREATE INDEX IF NOT EXISTS idx_reward_beneficiary ON referral_rewards(beneficiary_code_id);
