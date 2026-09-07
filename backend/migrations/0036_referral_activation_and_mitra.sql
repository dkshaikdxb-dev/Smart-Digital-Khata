-- Referral MVP + Khata Mitra. Turns the accrue-at-signup scaffolding into an
-- activation-triggered, double-sided programme and adds a single-level agent
-- (Khata Mitra) layer. Additive and idempotent — safe to re-run.

-- Activation = the referred shop's FIRST collection (first cash/upi txn). A
-- referral is 'activated' when this stamp is set; rewards accrue then, not at
-- signup. NULL until the shop actually collects money.
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

-- Fast lookup by referred shop for the activation claim.
CREATE INDEX IF NOT EXISTS idx_referrals_shop ON referrals(referred_shop_id) WHERE referred_shop_id IS NOT NULL;

-- A Khata Mitra is a field-agent code: on activation it earns a Mitra bounty
-- instead of the peer 'referrer' reward.
ALTER TABLE referral_codes ADD COLUMN IF NOT EXISTS is_mitra BOOLEAN NOT NULL DEFAULT false;

-- Which side a reward row is for: 'referrer' | 'referee' | 'mitra'.
ALTER TABLE referral_rewards ADD COLUMN IF NOT EXISTS beneficiary_role TEXT;
