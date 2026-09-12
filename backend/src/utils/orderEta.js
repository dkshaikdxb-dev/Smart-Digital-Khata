const { query } = require('../config/db');

// The ONE definition of "how long until this order is ready?" (batch B).
//
// Everything about the ready-time promise resolves here: the chips the owner is
// offered, the ceiling a requested eta is clamped to, and the instant a chip
// turns into. The status endpoint, the "need more time" endpoint, the admin
// settings validation and the tests all import it from here, so the rule can
// never drift.
//
// WHY COARSE CHIPS. Aggregators ask a kitchen for a prep time in exact minutes.
// A kirana owner is not dispatching riders: they are serving the person in front
// of them, and "23 minutes" is false precision dressed up as a promise. Three
// coarse chips (15 / 30 / 60 by default) are the whole vocabulary, plus an
// honest "accept without a time" for the owner who genuinely cannot say.
//
// WHY AN INSTANT, NOT A DURATION. `promised_at` is stored as a TIMESTAMPTZ and
// every surface renders a CLOCK TIME from it. The customer reads the WhatsApp
// message ten minutes after it lands; "in 30 minutes" would already be a lie by
// then, "ready by 4:45 PM" never is.
//
// Same shape and the same promise as getOrderAlertBounds() / getShopHoursConfig():
// the config is read LIVE from platform_settings so an admin change applies to
// the very next request with no restart, and it NEVER throws — on any DB/parse
// error the built-in defaults stand, so a malformed setting can never take the
// accept button away from an owner mid-rush.

const ETA_DEFAULTS = Object.freeze({
  chips: Object.freeze([15, 30, 60]),
  max_minutes: 240,
});

// At most FOUR chips ever reach a client. The point of this feature is a
// one-tap decision; a row of eight buttons is a form again.
const MAX_CHIPS = 4;

// Absolute guard rails the stored setting itself is clamped to, so even a
// hand-edited platform_settings row cannot promise next week.
const HARD_MIN_MINUTES = 1;
const HARD_MAX_MINUTES = 1440; // 24 hours

/**
 * Parse a comma-separated minute list ('15,30,60') into a clean chip array:
 * positive integers only, de-duplicated, sorted ascending, each clamped to
 * 1..maxMinutes, at most MAX_CHIPS of them.
 *
 * Returns null — NOT an empty array — when nothing usable survives, so the
 * caller can tell "the operator configured something unusable" (fall back to
 * the defaults) from "the operator configured one chip".
 */
function parseChips(raw, maxMinutes) {
  if (raw == null) return null;
  const max = Math.min(HARD_MAX_MINUTES, Math.max(HARD_MIN_MINUTES, Number(maxMinutes) || ETA_DEFAULTS.max_minutes));
  const seen = new Set();
  for (const part of String(raw).split(',')) {
    const s = part.trim();
    if (!/^\d+$/.test(s)) continue; // a decimal or a word is not a chip
    const n = parseInt(s, 10);
    if (!Number.isFinite(n) || n < HARD_MIN_MINUTES || n > max) continue;
    seen.add(n);
  }
  if (!seen.size) return null;
  return Array.from(seen).sort((a, b) => a - b).slice(0, MAX_CHIPS);
}

/**
 * The live chip list + ceiling. Never throws: a DB error, a missing row or a
 * malformed value all leave the built-in 15/30/60 and 240 standing.
 */
async function getEtaConfig() {
  try {
    const r = await query(
      `SELECT key, value FROM platform_settings
        WHERE key IN ('order_eta_chips','order_eta_max_minutes')`
    );
    const m = {};
    for (const row of r.rows) m[row.key] = row.value;

    const rawMax = parseInt(m.order_eta_max_minutes, 10);
    const max = Number.isFinite(rawMax) && rawMax > 0
      ? Math.min(HARD_MAX_MINUTES, Math.max(HARD_MIN_MINUTES, rawMax))
      : ETA_DEFAULTS.max_minutes;

    // Chips are validated AGAINST the resolved ceiling, so a chip that outgrew
    // a lowered max is dropped rather than silently clamped into a duplicate.
    const chips = parseChips(m.order_eta_chips, max)
      || parseChips(ETA_DEFAULTS.chips.join(','), max)
      || [Math.min(max, 15)];

    return { chips, max_minutes: max };
  } catch (_e) {
    return { chips: ETA_DEFAULTS.chips.slice(), max_minutes: ETA_DEFAULTS.max_minutes };
  }
}

/**
 * A requested eta as a whole number of minutes inside 1..max, or NULL when
 * there is no usable promise in the input (absent, zero, negative, a decimal,
 * a word). NULL means "accepted without a time" — the honest answer. Garbage is
 * never rounded UP into a promise nobody made; the route's validator rejects it
 * with a 400 long before it reaches here.
 */
function clampEta(raw, cfg) {
  const max = (cfg && cfg.max_minutes) || ETA_DEFAULTS.max_minutes;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < HARD_MIN_MINUTES) return null;
  return Math.min(max, n);
}

/**
 * The absolute instant `minutes` from `now`. Pure — the clock is passed in — so
 * the promise can be asserted in a test without freezing time globally.
 * Returns null for a null eta, i.e. "no promise", never `now`.
 */
function promisedAt(now, minutes) {
  if (minutes == null) return null;
  const n = Number(minutes);
  if (!Number.isFinite(n)) return null;
  const at = now instanceof Date ? now : new Date(now || Date.now());
  return new Date(at.getTime() + n * 60000);
}

module.exports = {
  getEtaConfig,
  parseChips,
  clampEta,
  promisedAt,
  ETA_DEFAULTS,
  MAX_CHIPS,
  HARD_MIN_MINUTES,
  HARD_MAX_MINUTES,
};
