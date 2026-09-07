-- Analytics Phase 1 — anonymous first-party product events + signup attribution.
--
-- PRIVACY: this table stores NO PII. There is deliberately no ip / user_agent /
-- name / email / phone column. `session_id` is an anonymous client-generated id
-- (not linked to any account), utm_* / referrer_host / path are low-cardinality
-- marketing context, and `props` is a tiny bounded JSON blob (capped <=1KB by the
-- ingest controller). Everything here is safe to keep first-party only.
CREATE TABLE IF NOT EXISTS analytics_events (
  id            BIGSERIAL PRIMARY KEY,
  event_name    TEXT NOT NULL,
  session_id    TEXT,
  ts            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  utm_source    TEXT,
  utm_medium    TEXT,
  utm_campaign  TEXT,
  utm_term      TEXT,
  utm_content   TEXT,
  referrer_host TEXT,
  path          TEXT,
  props         JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Top-of-funnel counts filter by (event_name, ts window); distinct-session and
-- source rollups scan by session_id / utm_source.
CREATE INDEX IF NOT EXISTS idx_analytics_events_name_ts ON analytics_events(event_name, ts);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_utm_source ON analytics_events(utm_source);

-- Signup attribution — captured on the shop at registration time. All nullable
-- (a caller may omit `attribution`); values are truncated to these lengths by the
-- register controller, mirroring the ingest truncation rules.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS signup_utm_source   TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS signup_utm_medium   TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS signup_utm_campaign TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS signup_referrer_host TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS signup_session_id   TEXT;
