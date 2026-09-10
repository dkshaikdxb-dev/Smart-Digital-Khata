-- 0049_referral_chain.sql
-- Fee-funded 2-level referral chain (Batch R2). Additive + idempotent.
-- A paid enrolment fee (0048) funds a fixed % to the direct referrer (L1) and
-- the referrer's referrer (L2), drawn ENTIRELY from the fee just collected —
-- zero platform burn. These columns tag the chain reward rows and let us prove
-- one paid enrolment funds at most ONE set of chain rewards (idempotency guard
-- on source_enrolment_id, see utils/referral.accrueEnrolmentChainRewards).
--
-- Dormant until enrolment_fee_enabled is flipped on; safe to land before that.
-- Money is integer paise. beneficiary_role stays free-text (no CHECK to widen);
-- chain rows use 'chain_l1' / 'chain_l2'. status stays 'accrued' (R3 adds 'settled').

ALTER TABLE referral_rewards ADD COLUMN IF NOT EXISTS level INT;                  -- 1 or 2 for chain rewards; NULL for legacy bounty
ALTER TABLE referral_rewards ADD COLUMN IF NOT EXISTS source_enrolment_id UUID
  REFERENCES enrolments(id) ON DELETE CASCADE;                                    -- which enrolment funded it
ALTER TABLE referral_rewards ADD COLUMN IF NOT EXISTS source_shop_id UUID;        -- the shop whose fee funded it (the new enrolee)

CREATE INDEX IF NOT EXISTS idx_reward_source_enrol ON referral_rewards(source_enrolment_id);
