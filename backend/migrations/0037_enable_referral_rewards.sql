-- Enable the referral reward rule and set the pilot ₹ amounts (lean pilot).
-- The reward rule lives in platform_settings (read by getRewardRule); it ships
-- OFF, so this one-time migration turns it on with the chosen amounts. Values are
-- integer paise stored as text, matching how the admin reward-rule endpoint writes
-- them (so a later Admin → Referrals edit overrides these without a code change).
--
--   Referrer ₹50  = 5000 paise   (referral_reward_paise)
--   Referee  ₹50  = 5000 paise   (referral_referee_paise)
--   Mitra    ₹100 = 10000 paise  (referral_mitra_paise)  -- paid local-agent bounty
--
-- Rewards are ACCRUED credit only (no automated payout) and accrue on activation
-- (a referred shop's first collection), per 0036. Runs exactly once (tracked in
-- _migrations); a manual re-run is safe (it just re-asserts these values).

INSERT INTO platform_settings (key, value, updated_at) VALUES
  ('referral_reward_enabled', 'true',  NOW()),
  ('referral_reward_paise',   '5000',  NOW()),
  ('referral_referee_paise',  '5000',  NOW()),
  ('referral_mitra_paise',    '10000', NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
