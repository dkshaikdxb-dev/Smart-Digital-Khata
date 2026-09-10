-- 0050_referral_wallet.sql
-- Closed-loop referral wallet + real-time settlement + dues-credit redemption
-- (Batch R3). Additive + idempotent. All money is integer paise.
--
-- Turns accrued referral rewards (0049) into spendable, book-entry value that
-- stays INSIDE the ecosystem. The balance is exposed to users as "Khata Credits"
-- (a single-issuer loyalty/discount credit, NOT a stored-value/PPI instrument),
-- but the internal table names stay referral_wallets / referral_ledger.
--
-- GUARDRAILS baked into the schema: no cash-out, no P2P transfer, no third-party
-- shop spend, no interest. balance_paise can NEVER go negative (CHECK >= 0, and a
-- guarded debit in utils/wallet.js). Cross-shop spend, P2P transfer and external
-- bank/UPI payout are intentionally NOT modelled here — they are the next,
-- license-dependent (KYC-gated) phase, which will add a `transfers` table plus a
-- `code`-wallet external payout rail. Keeping this migration minimal is deliberate.

-- A closed-loop balance per beneficiary. owner_type:
--   'shop'     redeemable vs platform dues (enrolment / subscription) — a real shop.
--   'customer' a consumer referrer's balance.
--   'code'     an influencer/other code with no system account — EARMARKED;
--              redemption stays gated until the external-payout phase ships.
CREATE TABLE IF NOT EXISTS referral_wallets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type    TEXT NOT NULL CHECK (owner_type IN ('shop','customer','code')),
  owner_id      UUID NOT NULL,
  balance_paise BIGINT NOT NULL DEFAULT 0 CHECK (balance_paise >= 0),
  currency      TEXT NOT NULL DEFAULT 'INR',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_type, owner_id)
);

-- Immutable audit trail. Every credit/debit writes exactly one row carrying the
-- running balance_after so the ledger is self-verifying.
CREATE TABLE IF NOT EXISTS referral_ledger (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id          UUID NOT NULL REFERENCES referral_wallets(id) ON DELETE CASCADE,
  direction          TEXT NOT NULL CHECK (direction IN ('credit','debit')),
  amount_paise       BIGINT NOT NULL CHECK (amount_paise > 0),
  kind               TEXT NOT NULL,   -- reward_settled | redeem_enrolment | redeem_subscription
                                      -- | redeem_promo | redeem_whatsapp | redeem_premium
                                      -- | sponsor_shop | adjustment | reversal
  ref_reward_id      UUID REFERENCES referral_rewards(id) ON DELETE SET NULL,
  ref_note           TEXT,
  balance_after_paise BIGINT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by         UUID
);
CREATE INDEX IF NOT EXISTS idx_refledger_wallet ON referral_ledger(wallet_id, created_at DESC);

-- Widen reward status to allow 'settled' (accrued -> settled once it lands in a
-- wallet, via utils/referral.settleReward). Drop + re-add so this is idempotent.
ALTER TABLE referral_rewards DROP CONSTRAINT IF EXISTS referral_rewards_status_check;
ALTER TABLE referral_rewards ADD CONSTRAINT referral_rewards_status_check
  CHECK (status IN ('accrued','settled','void'));
ALTER TABLE referral_rewards ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;

-- Influencer flat bounty + budget cap (per code). NULL flat_bounty_paise -> not
-- an influencer-bounty code. NULL budget_cap_paise -> uncapped. Non-negativity is
-- enforced in the app (admin PATCH validates integers >= 0).
ALTER TABLE referral_codes ADD COLUMN IF NOT EXISTS flat_bounty_paise BIGINT;
ALTER TABLE referral_codes ADD COLUMN IF NOT EXISTS budget_cap_paise  BIGINT;

-- Audit how much wallet credit was applied against an enrolment fee (redemption
-- method A). NULL = no credit applied. The Razorpay charge is amount_paise minus
-- this. Optional but kept for a clean money trail.
ALTER TABLE enrolments ADD COLUMN IF NOT EXISTS wallet_applied_paise BIGINT;

-- Real-time settlement flag. 'true' (default) => a reward credits the beneficiary
-- wallet the instant it accrues (in the same transaction). 'false' => accrual
-- leaves rewards 'accrued' and an admin settles them later. DO NOTHING so an
-- admin's later edit is never clobbered.
INSERT INTO platform_settings (key, value, updated_at) VALUES
  ('referral_autosettle', 'true', NOW())
ON CONFLICT (key) DO NOTHING;
