-- The new-order alert ends only on a DECISION, and a rejected prepaid order
-- becomes shop credit (batch ALERT2).
--
-- TWO OWNER DECISIONS, one migration.
--
-- (A) A PASSIVE "Seen" MUST NOT SILENCE AN ORDER FOREVER.
--     Until now `orders.acknowledged_at` was the ONE silencer: tapping "Seen"
--     set it and the alert went quiet while the order sat in 'pending' with
--     nobody having answered the customer. That is exactly the failure the
--     alert exists to prevent — the owner silences it, gets busy, and the
--     customer waits on an order nobody ever decided.
--
--     From here the rule is simply: an order NEEDS ALERTING while it is still
--     'pending'. Only ACCEPTING it or REJECTING it (status -> 'cancelled')
--     answers the customer, so only those stop the alert.
--
--     `acknowledged_at` / `acknowledged_by` are KEPT and still stamped — they
--     are a genuinely useful audit of when the owner first laid eyes on the
--     order — they simply no longer silence anything.
--
--     What "Seen" now does instead lives in the new column:
--
--       orders.snoozed_until  a SHORT per-order quiet window ("not now, 5 min").
--                             NULL, or in the past, means the order is alerting.
--                             The WhatsApp tick and both banners skip an order
--                             whose snooze is still running, and it comes back
--                             the moment the window lapses.
--
-- (B) `order_alert_snooze_minutes` — how long one "Seen" tap buys, in
--     platform_settings so an admin can tune it live with no deploy (read the
--     same never-throws way as the order-alert bounds seeded in 0065). Default
--     5 minutes; the reader clamps to 1..120 so neither a typo nor a hand-edited
--     row can turn a snooze into an indefinite silence.
--
-- NOTE ON WHAT CHANGES FOR EXISTING ROWS. There is deliberately NO backfill.
-- Every column added here starts NULL, which reads as "never snoozed" — so a
-- still-'pending' order that an owner previously silenced with "Seen" starts
-- alerting again on the next tick. That is the POINT of this batch: those orders
-- were never decided and the customer is still waiting on them. The per-shop
-- repeat cap (shops.order_alert_max_repeats, 0065) still bounds the WhatsApp
-- re-send, so an old backlog surfaces in the banners without a burst of messages.
--
-- Additive + idempotent: every statement is IF NOT EXISTS / ON CONFLICT, so a
-- re-run changes nothing and no existing column or row is rewritten.

-- The short quiet window one "Seen" tap buys. NOT a silencer: the order is still
-- pending, still undecided and still on the alerts list — it is just quiet for a
-- few minutes.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ;

-- The index the new predicate uses: shop-scoped, pending, snooze state. The
-- 0065 index (shop_id, status, acknowledged_at) is left in place — it is still a
-- perfectly good (shop_id, status) prefix and dropping it would only churn.
CREATE INDEX IF NOT EXISTS idx_orders_pending_alert ON orders (shop_id, status, snoozed_until);

-- How long a snooze lasts, in minutes. A PLATFORM policy number, not a
-- credential — it saves through the same plain numeric settings path as the
-- order-alert bounds above it, with no typed I CONFIRM.
-- ON CONFLICT DO NOTHING: a one-time seed that never overwrites an operator edit.
INSERT INTO platform_settings (key, value, updated_at) VALUES
  ('order_alert_snooze_minutes', '5', NOW())
ON CONFLICT (key) DO NOTHING;
