const { query } = require('../config/db');

// The ONE definition of "this order still needs alerting" (batch ORDERALERT).
//
//   an order NEEDS ALERTING  <=>  status = 'pending' AND acknowledged_at IS NULL
//
// The controller (GET /orders/alerts), the BullMQ tick (order-alert.service) and
// the tests all import it from here, so the three can never drift. Acknowledging
// is IMPLICIT whenever the order leaves 'pending' (order.controller.updateStatus
// stamps acknowledged_at in the SAME update), which is why the predicate needs
// both halves: accepting an order silences it with no extra tap, and an explicit
// "Seen" silences it without changing the status.

// SQL predicate over an `orders` alias. Pure string, no parameters, so it drops
// straight into any WHERE/AND.
function needsAlertingSql(alias = 'o') {
  return `${alias}.status = 'pending' AND ${alias}.acknowledged_at IS NULL`;
}

// The same rule in JS, for a row already in hand (a re-check after a lock, a
// test assertion). Treats a missing field as "not alerting" rather than guessing.
function needsAlerting(order) {
  if (!order) return false;
  return order.status === 'pending' && order.acknowledged_at == null;
}

// ---- Platform bounds -----------------------------------------------------
// The floor/ceiling on the per-shop cadence live in platform_settings (0065) and
// are read LIVE from the DB — the same style as getShopPromoConfig — so an admin
// change applies to the very next write with no restart. Never throws: on any
// DB/parse error the built-in defaults stand, so a malformed setting can never
// unlock a 10-second repeat or an unbounded nag.
const BOUND_DEFAULTS = Object.freeze({
  min_minutes: 2,
  max_minutes: 60,
  max_repeats_cap: 20,
});

// Absolute guard rails the stored settings themselves are clamped to, so even a
// hand-edited platform_settings row cannot produce a sub-minute repeat or an
// effectively infinite one.
const HARD_MIN_MINUTES = 1;
const HARD_MAX_MINUTES = 720; // 12 hours
const HARD_MAX_REPEATS = 100;

function posInt(raw, fallback) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function getOrderAlertBounds() {
  try {
    const r = await query(
      `SELECT key, value FROM platform_settings
        WHERE key IN ('order_alert_min_minutes','order_alert_max_minutes','order_alert_max_repeats_cap')`
    );
    const m = {};
    for (const row of r.rows) m[row.key] = row.value;
    const min = Math.min(
      HARD_MAX_MINUTES,
      Math.max(HARD_MIN_MINUTES, posInt(m.order_alert_min_minutes, BOUND_DEFAULTS.min_minutes))
    );
    const max = Math.min(
      HARD_MAX_MINUTES,
      Math.max(min, posInt(m.order_alert_max_minutes, BOUND_DEFAULTS.max_minutes))
    );
    const cap = Math.min(
      HARD_MAX_REPEATS,
      Math.max(1, posInt(m.order_alert_max_repeats_cap, BOUND_DEFAULTS.max_repeats_cap))
    );
    return { min_minutes: min, max_minutes: max, max_repeats_cap: cap };
  } catch (_e) {
    return { ...BOUND_DEFAULTS };
  }
}

// Clamp a requested repeat interval into [min, max]. A non-integer/garbage value
// falls back to the platform minimum rather than to an unbounded number.
function clampRepeatMinutes(raw, bounds) {
  const b = bounds || BOUND_DEFAULTS;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return b.min_minutes;
  return Math.min(b.max_minutes, Math.max(b.min_minutes, n));
}

// Clamp a requested repeat count into [0, cap]. 0 is legal — it means "alert
// once on arrival and never repeat" — so the floor here is 0, not 1.
function clampMaxRepeats(raw, bounds) {
  const b = bounds || BOUND_DEFAULTS;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return b.max_repeats_cap;
  return Math.min(b.max_repeats_cap, Math.max(0, n));
}

module.exports = {
  needsAlertingSql,
  needsAlerting,
  getOrderAlertBounds,
  clampRepeatMinutes,
  clampMaxRepeats,
  BOUND_DEFAULTS,
};
