-- Per-viewer impression dedup for promos (batch DEDUP). Backs the "daily unique
-- impressions" metric: a viewer counts at most once per campaign per calendar
-- day, so a shopper reloading the home screen no longer inflates the count.
--
-- The impression beacon now inserts (campaign_id, viewer_id) here first and only
-- bumps ad_campaigns.impressions when a genuinely new row lands (ON CONFLICT DO
-- NOTHING → rowCount 0 means already counted today). viewer_id is a random,
-- opaque, per-device token (localStorage 'skhata-vid') — no PII. Clicks stay
-- raw. Beacons with no viewer_id keep the old raw increment (back-compat).
--
-- Additive, idempotent, no seed.

CREATE TABLE IF NOT EXISTS ad_impressions (
  campaign_id UUID NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  viewer_id   TEXT NOT NULL,
  day         DATE NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (campaign_id, viewer_id, day)
);
