-- Content engine — editorial pipeline (Batch Q). An ADDITIVE surface: the
-- content "newsroom" that turns live product metrics into briefs, moves each
-- item through a guarded state machine, and (once a human has approved anything
-- above the evergreen tier) publishes it through a pluggable per-channel adapter.
--
-- The SAFETY CORE lives in the data model + the app: an item can only reach
-- 'approved' via a human, and only reach 'scheduled'/'published' when it is a
-- Tier-0 (evergreen) item OR a human approval is recorded (approved_at). Nothing
-- here auto-drafts copy or calls an external network — those bolt on later.
--
-- Money (where it appears inside a brief's metrics) is INTEGER PAISE, matching
-- the rest of the platform; the frontend rounds to rupees for display. Nothing
-- existing is touched. Idempotent (IF NOT EXISTS throughout).

CREATE TABLE IF NOT EXISTS content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL CHECK (channel IN
    ('blog','linkedin','twitter','newsletter_community','newsletter_ecosystem','whatsapp_tip','reel','voice')),
  engine TEXT NOT NULL CHECK (engine IN ('record','reach')),          -- A=record, B=reach
  autonomy_tier SMALLINT NOT NULL DEFAULT 1 CHECK (autonomy_tier IN (0,1,2)),
  language TEXT NOT NULL DEFAULT 'en',
  title TEXT,
  brief TEXT,                                                          -- strategist brief / prompt
  body TEXT,                                                           -- the draft
  status TEXT NOT NULL DEFAULT 'idea' CHECK (status IN
    ('idea','drafting','draft','localized','in_review','approved','scheduled','published','rejected','archived')),
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'human',                               -- 'strategist' | 'human' | 'agent'
  created_by UUID, approved_by UUID, approved_at TIMESTAMPTZ,
  external_ref TEXT,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,                            -- e.g. {seed_key} for idempotent seeding
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_content_status_sched ON content_items(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_content_channel ON content_items(channel, status);
-- The unique seed index makes the strategist idempotent: one brief per
-- (channel, periodKey), so a re-run in the same ISO week no-ops the duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS uq_content_seed ON content_items((meta->>'seed_key')) WHERE meta ? 'seed_key';

CREATE TABLE IF NOT EXISTS content_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  from_status TEXT, to_status TEXT NOT NULL, actor UUID, actor_kind TEXT NOT NULL DEFAULT 'human',
  note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_content_events ON content_events(content_id, created_at);

CREATE TABLE IF NOT EXISTS content_publish_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  channel TEXT NOT NULL, adapter TEXT NOT NULL, result TEXT NOT NULL CHECK (result IN ('sent','skipped','failed')),
  external_ref TEXT, detail TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_content_publish_log ON content_publish_log(content_id, created_at);
