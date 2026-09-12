-- Repeating new-order alert until the owner ACKNOWLEDGES it (batch ORDERALERT).
--
-- A new order today fires exactly ONE WhatsApp line to the owner and then goes
-- quiet. If the owner is serving a customer, on a 2G bus, or the phone is in a
-- pocket, the order simply waits. This migration adds the state the three alert
-- channels (owner web console, owner native app, WhatsApp re-send) all share:
--
--   orders.acknowledged_at   when the owner said "I have seen it" — the ONE
--                            silencer. NULL + status='pending' == still nagging.
--   orders.acknowledged_by   which owner/staff user acknowledged it.
--   orders.alert_count       how many times the repeat has been SENT (the cap
--                            lives in shops.order_alert_max_repeats), so the
--                            nagging always terminates.
--   orders.last_alert_at     when the last alert went out — the repeat cadence
--                            is measured from here (or created_at for the first).
--
-- and the per-shop policy:
--
--   shops.order_alert_enabled         master switch for this shop.
--   shops.order_alert_repeat_minutes  how often to repeat (clamped by the
--                                     platform min/max below).
--   shops.order_alert_max_repeats     how many repeats before it goes quiet
--                                     (clamped by the platform cap below).
--   shops.order_alert_muted_until     "turn it off for now" — silences BOTH the
--                                     app banners and the WhatsApp re-send.
--
-- Additive + idempotent: every statement is IF NOT EXISTS / ON CONFLICT, so a
-- re-run changes nothing and no existing column or row is rewritten.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS alert_count INT NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_alert_at TIMESTAMPTZ;
-- The one index every "needs alerting" query uses (shop-scoped, pending,
-- unacknowledged). Mirrors the shared predicate in utils/orderAlerts.js.
CREATE INDEX IF NOT EXISTS idx_orders_unacked ON orders (shop_id, status, acknowledged_at);

ALTER TABLE shops ADD COLUMN IF NOT EXISTS order_alert_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS order_alert_repeat_minutes INT NOT NULL DEFAULT 5;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS order_alert_max_repeats INT NOT NULL DEFAULT 6;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS order_alert_muted_until TIMESTAMPTZ;

-- BACKFILL. A still-pending order keeps acknowledged_at NULL, which is exactly
-- right: it has never been seen, so it SHOULD start alerting. Everything that
-- already left 'pending' (accepted / preparing / … / completed / cancelled) is
-- historically done — mark it acknowledged at its last update so no old order
-- wakes up and starts nagging the moment this ships. Idempotent: the
-- `acknowledged_at IS NULL` guard means a re-run touches nothing.
UPDATE orders
   SET acknowledged_at = updated_at
 WHERE status <> 'pending'
   AND acknowledged_at IS NULL;

-- Platform bounds for the per-shop cadence, in platform_settings so an admin can
-- tune the floor/ceiling without a deploy (read LIVE, like the promo/storefront
-- configs). The per-shop values are clamped to these on write.
--   order_alert_min_minutes     never repeat more often than this (2G + cost)
--   order_alert_max_minutes     never repeat slower than this (it stops helping)
--   order_alert_max_repeats_cap hard ceiling on the repeat count, so the nagging
--                               always terminates even on a fat-fingered value
-- ON CONFLICT DO NOTHING: a one-time seed that never overwrites an operator edit.
INSERT INTO platform_settings (key, value, updated_at) VALUES
  ('order_alert_min_minutes', '2', NOW()),
  ('order_alert_max_minutes', '60', NOW()),
  ('order_alert_max_repeats_cap', '20', NOW())
ON CONFLICT (key) DO NOTHING;
