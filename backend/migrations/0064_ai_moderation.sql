-- AI-assisted content moderation, PHASE 1 (batch AI-MOD). An LLM triages the two
-- owner-content review queues that already exist — storefront photos
-- (shop_images, 0062/0063) and owner promos (ad_campaigns self_serve, 0054/0061)
-- — so the admin desk opens on the risky rows and the obviously-safe ones go
-- live without a human tap:
--
--   ai_verdict  the stored classification { decision, confidence, categories,
--               reason, model, at } exactly as parsed from the model. NULL until
--               the job has run (or when the feature is off / not configured).
--   ai_flagged  true when the model said "hold" at or above the hold threshold.
--               The row STAYS pending_review — the flag only sorts it to the top
--               of the admin queue and tints it. The AI never rejects anything.
--
-- Auto-approve flips status to 'active' the same way an admin approve does; a
-- moderation_actions row (admin_user_id NULL, action ai_auto_approve / ai_hold /
-- ai_review) records every AI decision on the ONE existing audit trail, so admin
-- overrides can be measured against it.
--
-- Additive + idempotent. Existing rows keep ai_verdict NULL / ai_flagged false.

ALTER TABLE shop_images ADD COLUMN IF NOT EXISTS ai_verdict JSONB;
ALTER TABLE shop_images ADD COLUMN IF NOT EXISTS ai_flagged BOOLEAN NOT NULL DEFAULT false;
-- The admin queue reads pending rows flagged-first.
CREATE INDEX IF NOT EXISTS idx_shop_images_status_ai_flagged ON shop_images (status, ai_flagged);

ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS ai_verdict JSONB;
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS ai_flagged BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status_ai_flagged ON ad_campaigns (status, ai_flagged);

-- The on/off flag + the two policy thresholds live in platform_settings, read
-- LIVE by the job (like the storefront buy-out, 0063) so an admin change takes
-- effect on the next job. ON CONFLICT DO NOTHING: a one-time seed that never
-- overwrites an operator edit.
--   ai_moderation_enabled           master switch (the API key + model id still
--                                   have to be set in the environment)
--   ai_moderation_auto_approve_min  min confidence for an "approve" verdict to
--                                   publish without a human (0.5..1.0)
--   ai_moderation_hold_min          min confidence for a "hold" verdict to flag
--                                   the row to the top of the queue (0.5..1.0)
INSERT INTO platform_settings (key, value, updated_at) VALUES
  ('ai_moderation_enabled', 'true', NOW()),
  ('ai_moderation_auto_approve_min', '0.90', NOW()),
  ('ai_moderation_hold_min', '0.90', NOW())
ON CONFLICT (key) DO NOTHING;
