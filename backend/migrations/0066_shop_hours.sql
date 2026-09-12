-- SHOP AVAILABILITY — "is this shop taking orders right now?" (batch A).
--
-- Until now nothing stopped the storefront taking an order into a shuttered
-- shop: `shops` carried no open flag at all, only the informational free-text
-- `delivery_hours` (0015). That column STAYS — it is still shown as a human
-- note — but it never gates anything. Gating lives in the four columns below
-- plus the per-date closures table, and every surface (owner web + app,
-- consumer PWA + app, and the order API) derives its answer from the ONE
-- helper in src/utils/shopOpen.js.
--
--   shops.is_open       the owner's master switch ("Open"/"Closed" on Home).
--   shops.paused_until  "back in 30 minutes" — a short, self-expiring pause.
--   shops.open_time     start of the daily window. NULL = no daily window.
--   shops.close_time    end of the daily window. NULL = no daily window.
--                       close_time < open_time is a legal OVERNIGHT window
--                       (e.g. 17:00–01:00); both must be set or both NULL.
--   shop_closures       one row per festival/holiday date the shop is shut.
--
-- ADDITIVE + IDEMPOTENT: every statement is IF NOT EXISTS / ON CONFLICT, so a
-- re-run changes nothing. Every EXISTING shop stays OPEN — is_open defaults to
-- true, paused_until/open_time/close_time stay NULL and no closure rows exist —
-- so deploying this file changes no shop's behaviour by itself.

ALTER TABLE shops ADD COLUMN IF NOT EXISTS is_open      BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS paused_until TIMESTAMPTZ;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS open_time    TIME;   -- NULL = no daily window (always open)
ALTER TABLE shops ADD COLUMN IF NOT EXISTS close_time   TIME;   -- NULL = no daily window

-- Festival / one-off closures. `on_date` is a plain DATE in the shop timezone
-- (Asia/Kolkata by default — see utils/shopOpen.js; there is deliberately no
-- per-shop timezone column, every shop is in India). UNIQUE (shop_id, on_date)
-- makes the owner's "add this date" an upsert instead of a duplicate row.
CREATE TABLE IF NOT EXISTS shop_closures (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id    UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  on_date    DATE NOT NULL,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shop_id, on_date)
);

-- The one index every availability lookup uses: "is THIS shop closed on THIS
-- date?" — the discovery list's LEFT JOIN and the order-time gate alike.
CREATE INDEX IF NOT EXISTS idx_shop_closures_shop_date ON shop_closures (shop_id, on_date);

-- Platform settings, read LIVE (never cached, never throwing) by
-- utils/shopOpen.js in the same style as getOrderAlertBounds():
--   shop_hours_enabled      the MASTER KILL-SWITCH. 'false' makes availability()
--                           return open:true for every shop, so the whole gate
--                           can be turned off platform-wide without a deploy if
--                           it ever misbehaves.
--   shop_pause_max_minutes  ceiling on a single "pause my shop" (default 24h),
--                           so a mis-tap can never shutter a shop indefinitely.
-- ON CONFLICT DO NOTHING: a one-time seed that never overwrites an operator edit.
INSERT INTO platform_settings (key, value, updated_at) VALUES
  ('shop_hours_enabled', 'true', NOW()),
  ('shop_pause_max_minutes', '1440', NOW())
ON CONFLICT (key) DO NOTHING;
