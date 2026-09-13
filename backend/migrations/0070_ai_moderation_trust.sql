-- AI-assisted content moderation, PHASE 2 (batch MOD2). Phase 1 (0064) triages
-- each photo / promo ON ITS OWN: a confident "approve" publishes, a confident
-- "hold" flags the row to the top of the admin queue, nothing is ever rejected,
-- every failure is fail-open. It has no memory and no feedback loop.
--
-- Phase 2 adds the three things that turn that into LESS ADMIN WORK rather than
-- the same work with a badge:
--
--   1. SHOP TRUST (shop_moderation_trust) — a per-shop memory of how its
--      content has actually been judged. A shop with a clean history earns a
--      LOWER auto-approve bar; a shop that has been rejected earns a HIGHER one.
--      Trust only ever moves the bar — it can never turn a "hold" into a
--      publish, and utils/moderationTrust.js keeps a HARD FLOOR of 0.75 on the
--      effective auto-approve threshold whatever the settings say.
--
--   2. POST-PUBLISH SPOT CHECKS (moderation_spot_checks) — a random sample of
--      what the AI published, queued for a human second look. Auto-approval is
--      only safe if somebody looks at a slice of it afterwards; without this a
--      model drift or a prompt regression publishes quietly for weeks.
--
--   3. HONEST METRICS — the two tables give aiStats the numbers that matter:
--      how many auto-approvals were never overturned (the work actually saved)
--      and how many were (the cost of being wrong).
--
-- Additive + idempotent. BACKFILLS NOTHING: every shop starts neutral at 0.5,
-- so the bar is the plain policy bar until a shop has earned a history.

-- Per-shop moderation history. One row per shop, created on the first decision.
--   approved_count   items a HUMAN approved, or the AI auto-approved and no
--                    human later overturned (an overturn decrements this and
--                    increments rejected_count — see utils/moderationTrust.js)
--   rejected_count   items a human rejected (incl. a spot check marked 'bad')
--   last_rejected_at when the most recent rejection happened; the recency
--                    penalty in the score decays over ~90 days from here
--   score            0..1, DERIVED from the three columns above by
--                    moderationTrust.scoreFor(). Stored (not computed on read)
--                    so a query can order/filter by it cheaply; every writer
--                    recomputes it in the same statement pair as the counters.
CREATE TABLE IF NOT EXISTS shop_moderation_trust (
  shop_id            UUID PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  approved_count     INT NOT NULL DEFAULT 0,
  rejected_count     INT NOT NULL DEFAULT 0,
  last_rejected_at   TIMESTAMPTZ,
  score              NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Post-publish spot checks: a sample of AUTO-APPROVED items queued for a second
-- look. The item is ALREADY LIVE when the row is written — this queue is about
-- catching what got through, which is why the admin card for it is kept
-- visually separate from the two pre-publish queues.
--   status 'pending' waiting for a human
--          'ok'      a human looked and the AI was right — nothing changes
--          'bad'     the AI was wrong: the item is taken back down to
--                    pending_review, the shop's trust is decremented and an
--                    audit row is written with the admin's id
-- UNIQUE (kind, target_id) makes sampling idempotent: an item can be queued for
-- a spot check at most once.
CREATE TABLE IF NOT EXISTS moderation_spot_checks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         TEXT NOT NULL CHECK (kind IN ('shop_image','campaign')),
  target_id    UUID NOT NULL,
  shop_id      UUID REFERENCES shops(id) ON DELETE CASCADE,
  ai_verdict   JSONB,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ok','bad')),
  reviewed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at  TIMESTAMPTZ,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kind, target_id)
);
-- The queue reads pending, oldest first.
CREATE INDEX IF NOT EXISTS idx_spot_checks_status ON moderation_spot_checks (status, created_at);

-- The five knobs, in platform_settings beside the Phase-1 policy keys and read
-- LIVE by utils/moderationTrust.getTrustConfig() (same shape as
-- utils/orderAlerts.getOrderAlertBounds) so an admin change applies to the very
-- next job with no restart. ON CONFLICT DO NOTHING: a one-time seed that never
-- overwrites an operator edit.
--   ai_moderation_trust_enabled    trust's OWN switch, independent of
--                                  ai_moderation_enabled. Off => the bar is the
--                                  plain policy bar for every shop; the
--                                  counters are still kept, so switching it on
--                                  later is not blind.
--   ai_moderation_trust_min_items  how many decided items a shop needs before
--                                  trust may bend the bar at all (0..100)
--   ai_moderation_trust_bonus      how far a trusted shop's auto-approve bar
--                                  DROPS (0..0.30, and never below the 0.75
--                                  hard floor)
--   ai_moderation_distrust_penalty how far a rejected shop's auto-approve bar
--                                  RISES (0..0.30)
--   ai_moderation_spot_check_pct   percent of auto-approvals sampled for a
--                                  post-publish second look (0..100)
INSERT INTO platform_settings (key, value, updated_at) VALUES
  ('ai_moderation_trust_enabled', 'true', NOW()),
  ('ai_moderation_trust_min_items', '5', NOW()),
  ('ai_moderation_trust_bonus', '0.05', NOW()),
  ('ai_moderation_distrust_penalty', '0.10', NOW()),
  ('ai_moderation_spot_check_pct', '10', NOW())
ON CONFLICT (key) DO NOTHING;
