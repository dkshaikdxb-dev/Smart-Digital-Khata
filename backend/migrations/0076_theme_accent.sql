-- Operator-controlled accent colour, with festive windows (batch THEME1).
--
-- The apps and the storefront are built on one accent — the khata green #22c55e —
-- hardcoded in three places. This makes that one value the platform's to set, and
-- lets it change for a window: Diwali, Eid, Pongal, a sale weekend.
--
-- ONLY the accent. The dark base, the cards and the text stay fixed in the client.
-- That is deliberate: a shopkeeper reads this screen in daylight on a cheap phone,
-- and an operator who can repaint the text can make it unreadable from here with
-- no way to see it. The accent is the one colour that carries brand and cannot,
-- on its own, hide anything — it tints buttons, active pills and highlights, and
-- every one of those draws its own foreground from onAccent.
--
-- The window mechanism is referral_campaigns' (0055), not a new one: status +
-- starts_at/ends_at + priority, resolved by the same "active now, highest
-- priority wins" rule. What it deliberately does NOT copy is that table's geo
-- targeting. The owner app and a storefront page each belong to one shop and so
-- have a location, but the consumer app's own chrome belongs to no shop — a
-- shopper browses many towns — so "which town's festival" has no answer there.
-- Platform-wide windows only; geo can be added later without changing the client.
--
-- The RESOLUTION happens on the server and /public/config returns the answer, so
-- no client ships date logic, and a phone with a wrong clock cannot pick the
-- wrong theme.
--
-- Additive and idempotent. Ships INERT: the seeded default is the exact colour
-- the clients already hardcode, so deploying this changes nothing on screen until
-- an operator edits it.

-- The standing accent. #RRGGBB, validated in the app layer before it is written.
INSERT INTO platform_settings (key, value, updated_at) VALUES
  ('theme_accent', '#22c55e', NOW())
ON CONFLICT (key) DO NOTHING;

-- A festive window. `accent` overrides platform_settings.theme_accent while the
-- row is active and NOW() is inside its dates. `label` is for the admin list and
-- is returned with the resolved colour so support can see which window is live.
CREATE TABLE IF NOT EXISTS theme_campaigns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  accent      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','ended')),
  starts_at   TIMESTAMPTZ,
  ends_at     TIMESTAMPTZ,
  priority    INTEGER NOT NULL DEFAULT 0,   -- higher wins when several are active
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The resolver reads this on every /public/config, which every app start hits.
CREATE INDEX IF NOT EXISTS idx_theme_campaigns_live
  ON theme_campaigns (status, priority DESC, starts_at, ends_at);

-- No seed. Ships dormant: no window exists until an operator creates one.
