const { query } = require('../config/db');

// The ONE definition of "this order still needs alerting" (batch ORDERALERT,
// rewritten by batch ALERT2).
//
//   an order NEEDS ALERTING  <=>  status = 'pending'
//
// That is the whole rule, and the missing half is the point. Until ALERT2 a
// passive "Seen" tap stamped `acknowledged_at` and the predicate went false
// forever while the order sat in 'pending' with nobody having answered the
// customer — exactly the failure the alert exists to prevent. Only ACCEPTING the
// order or REJECTING it (status -> 'cancelled') actually answers the customer,
// so only those stop the alert. `acknowledged_at` is still stamped, both
// explicitly (POST /orders/:id/ack) and implicitly on any move out of 'pending'
// (order.controller.updateStatus), because WHEN the owner first saw an order is
// worth auditing — it simply no longer silences anything.
//
// "Seen" instead buys a SHORT quiet window: `orders.snoozed_until` (migration
// 0069). That is a separate, orthogonal predicate — notSnoozedSql/isSnoozed
// below — so the two questions never get tangled: "does this order still need a
// decision?" and "are we being quiet about it for a few more minutes?".
//
// The controller (GET /orders/alerts), the BullMQ tick (order-alert.service) and
// the tests all import both from here, so they can never drift.

// SQL predicate over an `orders` alias. Pure string, no parameters, so it drops
// straight into any WHERE/AND.
function needsAlertingSql(alias = 'o') {
  return `${alias}.status = 'pending'`;
}

// The same rule in JS, for a row already in hand (a re-check after a lock, a
// test assertion). Treats a missing field as "not alerting" rather than guessing.
function needsAlerting(order) {
  if (!order) return false;
  return order.status === 'pending';
}

// "Nobody has hit snooze on this one recently." The second half of every query
// that actually SENDS or SPEAKS something. Deliberately NOT folded into
// needsAlertingSql: GET /orders/alerts returns snoozed orders too (with their
// `snoozed_until`, so a banner can say "quiet for 4 more min") — they are still
// waiting for a decision, they are just quiet.
function notSnoozedSql(alias = 'o') {
  return `(${alias}.snoozed_until IS NULL OR ${alias}.snoozed_until < NOW())`;
}

// The same rule in JS, for a row already in hand (the re-check under the row
// lock in order-alert.service.claimOrder, and the client-side banner filter).
// An unparseable timestamp reads as "not snoozed": a garbled value must never be
// able to silence an order that is still waiting.
function isSnoozed(order, now) {
  if (!order || !order.snoozed_until) return false;
  const until = new Date(order.snoozed_until).getTime();
  if (!Number.isFinite(until)) return false;
  return until > (now ? new Date(now).getTime() : Date.now());
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

// ---- The snooze window (batch ALERT2) ------------------------------------
// How long ONE "Seen" tap keeps an order quiet. This is a SNOOZE, never a
// silence: the order is still pending, still undecided, still on the alerts
// list, and it comes back the moment the window lapses.
//
// The bounds are absolute and deliberately tight. 1 minute is the smallest
// useful pause; 2 hours is already far beyond "let me finish serving this
// customer", and anything longer would quietly become the silence this batch
// exists to remove. The shop-level "Mute" (1..720 min) is the honest way to ask
// for real quiet, and it is visible as a mute rather than hiding inside a tap
// labelled "Seen".
const SNOOZE_DEFAULT_MINUTES = 5;
const SNOOZE_MIN_MINUTES = 1;
const SNOOZE_MAX_MINUTES = 120;

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

// Clamp a requested snooze into [1, 120] minutes. Garbage falls back to the
// built-in default rather than to either bound, so a malformed platform setting
// produces the ordinary 5-minute snooze and never an unbounded quiet window.
function clampSnoozeMinutes(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return SNOOZE_DEFAULT_MINUTES;
  return Math.min(SNOOZE_MAX_MINUTES, Math.max(SNOOZE_MIN_MINUTES, n));
}

/**
 * The live snooze length, in minutes. Same shape and the same promise as
 * getOrderAlertBounds() and shopOpen.getShopHoursConfig(): read LIVE from
 * platform_settings so an admin change applies to the very next tap with no
 * restart, and NEVER throws — on any DB/parse error the built-in 5 minutes
 * stands, so a malformed setting can never silence an order indefinitely.
 */
async function getSnoozeMinutes() {
  try {
    const r = await query(
      "SELECT value FROM platform_settings WHERE key = 'order_alert_snooze_minutes'"
    );
    if (!r.rowCount) return SNOOZE_DEFAULT_MINUTES;
    return clampSnoozeMinutes(r.rows[0].value);
  } catch (_e) {
    return SNOOZE_DEFAULT_MINUTES;
  }
}

module.exports = {
  needsAlertingSql,
  needsAlerting,
  notSnoozedSql,
  isSnoozed,
  getOrderAlertBounds,
  clampRepeatMinutes,
  clampMaxRepeats,
  clampSnoozeMinutes,
  getSnoozeMinutes,
  BOUND_DEFAULTS,
  SNOOZE_DEFAULT_MINUTES,
  SNOOZE_MIN_MINUTES,
  SNOOZE_MAX_MINUTES,
};
