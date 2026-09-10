-- Seasonal + geo referral campaign engine (batch CAMP1) — reward overrides that
-- OVERRIDE the default referral reward for a time window + place + audience,
-- funded by a PRE-FUNDED budget cap so a campaign can never overspend its budget
-- (zero-burn against its own budget). E.g. "Diwali: 2x referral reward in
-- Bengaluru pincodes 560001-560010, budget Rs 50,000".
--
-- Reuses the ad_targets geo pattern (migration 0045): a campaign is scoped to a
-- town (= shop.city), a village, a pincode, or 'all' (everyone). Shop location
-- comes from the 0044 location model (shops.city / shops.village / shops.pincode).
--
-- Backend accrual applies the best-matching ACTIVE campaign when a referral
-- reward is written; the atomic guarded UPDATE on spent_paise is what makes the
-- budget cap unbreakable. Admin CRUD + UI manage the campaigns.
--
-- Additive, idempotent, no seed. Ships dormant: no campaign exists until an admin
-- creates + activates one. All money is integer paise.

CREATE TABLE IF NOT EXISTS referral_campaigns (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','ended')),
  audience       TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all','shop','mitra','influencer','consumer')),
  reward_type    TEXT NOT NULL CHECK (reward_type IN ('multiplier','flat_override')),
  -- multiplier: {"x": 2.0}  |  flat_override: {"referrer_paise":n,"referee_paise":n,"mitra_paise":n}
  reward_value   JSONB NOT NULL DEFAULT '{}'::jsonb,
  budget_cap_paise BIGINT NOT NULL DEFAULT 0,   -- 0 = uncapped is NOT allowed; require > 0 in the app
  spent_paise    BIGINT NOT NULL DEFAULT 0 CHECK (spent_paise >= 0),
  starts_at      TIMESTAMPTZ,
  ends_at        TIMESTAMPTZ,
  is_seasonal    BOOLEAN NOT NULL DEFAULT false,
  priority       INTEGER NOT NULL DEFAULT 0,     -- higher wins when several match
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_campaign_targets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES referral_campaigns(id) ON DELETE CASCADE,
  geo_type    TEXT NOT NULL CHECK (geo_type IN ('town','village','pincode','all')),
  geo_value   TEXT,
  UNIQUE (campaign_id, geo_type, geo_value)
);

CREATE INDEX IF NOT EXISTS idx_refcampaign_status ON referral_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_refcampaign_targets ON referral_campaign_targets(geo_type, geo_value);

-- Record which campaign funded a reward so campaign spend is auditable against
-- the reward rows. Nullable, soft ref (no FK) — a deleted campaign never orphans
-- or blocks a historical reward row.
ALTER TABLE referral_rewards ADD COLUMN IF NOT EXISTS campaign_id UUID;
