const { query } = require('../config/db');
const ApiError = require('./ApiError');

// The ONE definition of "is this shop taking orders right now?" (batch A).
//
// Every surface derives its answer from this file and nothing re-implements the
// rule: the consumer directory + storefront (discovery.controller), the order
// gate (my.controller.createOrder), the owner endpoints (shop.controller) and
// the tests. The clients (owner web + app, consumer PWA + app) only ever RENDER
// the `availability` object the API hands them.
//
//   availability(shop, now) -> { open, reason, reopens_at }
//
// `reason` is null when open, else one of:
//   'closed'   the owner flipped the master switch off
//   'paused'   paused_until is still in the future ("back in 30 minutes")
//   'holiday'  a shop_closures row exists for today
//   'hours'    outside the daily open_time..close_time window
//
// PRECEDENCE, in this order and no other:
//   is_open = false  ->  'closed'
//   paused_until > now  ->  'paused'
//   a closure row for today  ->  'holiday'
//   open_time AND close_time set and now outside the window  ->  'hours'
//   otherwise open.
// A pause therefore BEATS the daily hours: an owner who taps "30 min" during
// business hours is closed, and an owner who pauses outside business hours sees
// the pause (the nearer, more specific truth) rather than a generic "closed".
//
// TIMEZONE: "today" and the daily window are evaluated in
// `process.env.TZ || 'Asia/Kolkata'`. There is deliberately NO per-shop
// timezone column — every shop is in India — and the resolution lives HERE
// only, so no caller has to think about it.

const DEFAULT_TZ = 'Asia/Kolkata';

// The zone every date/time in this file is interpreted in. Read per call (not
// captured at require time) so a test can set process.env.TZ and see it apply.
function shopTimezone() {
  const tz = (process.env.TZ || '').trim();
  return tz || DEFAULT_TZ;
}

// ---- Timezone plumbing (Intl only — no new dependency) --------------------

// Wall-clock parts of `date` as seen in `tz`. Uses Intl.DateTimeFormat, which
// ships with Node's full ICU, so there is no library and no DST table to keep.
function zonedParts(date, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const out = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out;
}

// Offset (ms) of `tz` at the instant `date`. Positive east of UTC.
function tzOffsetMs(date, tz) {
  const p = zonedParts(date, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime();
}

// The UTC instant for a wall-clock time in `tz`. Two passes so a DST boundary
// resolves correctly (India has no DST, but this helper must not lie elsewhere).
function zonedToUtc(y, m, d, hh, mm, ss, tz) {
  const wall = Date.UTC(y, m - 1, d, hh, mm, ss || 0);
  let ts = wall - tzOffsetMs(new Date(wall), tz);
  ts = wall - tzOffsetMs(new Date(ts), tz);
  return new Date(ts);
}

const pad2 = (n) => String(n).padStart(2, '0');

// 'YYYY-MM-DD' for `now` in the shop timezone. This is the date the closure
// lookup binds — it is what "today" MEANS for a shop, so it must never be
// derived from the server's own locale.
function todayKey(now) {
  const p = zonedParts(now || new Date(), shopTimezone());
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

// Seconds since midnight for `now` in the shop timezone. Seconds (not minutes)
// so the JS rule and the SQL predicate below compare like for like.
function secondsOfDay(now) {
  const p = zonedParts(now || new Date(), shopTimezone());
  return p.hour * 3600 + p.minute * 60 + p.second;
}

// A pg TIME value ('09:00:00', or an already-parsed 'HH:MM') as seconds since
// midnight. Returns null for anything unusable, which the rule reads as
// "no daily window" — a malformed hour can never accidentally shut a shop.
function timeToSeconds(v) {
  if (v == null) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(v).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  const s = Number(m[3] || 0);
  if (h > 23 || mi > 59 || s > 59) return null;
  return h * 3600 + mi * 60 + s;
}

// 'HH:MM' from an 'HH:MM' / 'HH:MM:SS' input, or null. Used to normalize what
// the owner PATCHes before it is written.
function normalizeHm(v) {
  const secs = timeToSeconds(v);
  if (secs == null) return null;
  return `${pad2(Math.floor(secs / 3600))}:${pad2(Math.floor((secs % 3600) / 60))}`;
}

// ---- Live platform config -------------------------------------------------
// Same shape and the same promise as getOrderAlertBounds(): read LIVE from
// platform_settings so an admin change applies to the very next request with no
// restart, and NEVER throw — on any DB/parse error the built-in defaults stand.
// A missing/garbled `shop_hours_enabled` therefore leaves the gate ON rather
// than silently opening every shuttered shop.
const CONFIG_DEFAULTS = Object.freeze({
  enabled: true,
  pause_max_minutes: 1440, // 24h
});

// Absolute guard rails around the stored pause ceiling, so even a hand-edited
// platform_settings row cannot allow a year-long "pause".
const HARD_MAX_PAUSE_MINUTES = 43200; // 30 days

async function getShopHoursConfig() {
  try {
    const r = await query(
      `SELECT key, value FROM platform_settings
        WHERE key IN ('shop_hours_enabled','shop_pause_max_minutes')`
    );
    const m = {};
    for (const row of r.rows) m[row.key] = row.value;
    // Only an explicit 'false' turns the gate off; anything else keeps it on.
    const enabled = m.shop_hours_enabled === undefined ? true : String(m.shop_hours_enabled) !== 'false';
    const n = parseInt(m.shop_pause_max_minutes, 10);
    const maxMinutes = Number.isFinite(n) && n > 0
      ? Math.min(HARD_MAX_PAUSE_MINUTES, n)
      : CONFIG_DEFAULTS.pause_max_minutes;
    return { enabled, pause_max_minutes: maxMinutes };
  } catch (_e) {
    return { ...CONFIG_DEFAULTS };
  }
}

// ---- The rule -------------------------------------------------------------

// Is `nowSecs` inside [openSecs, closeSecs)? Handles the OVERNIGHT case
// (close < open, e.g. 17:00–01:00) by treating the window as wrapping midnight.
// open == close is read as "no meaningful window" -> always inside.
function insideWindow(nowSecs, openSecs, closeSecs) {
  if (openSecs == null || closeSecs == null) return true;
  if (openSecs === closeSecs) return true;
  if (openSecs < closeSecs) return nowSecs >= openSecs && nowSecs < closeSecs;
  return nowSecs >= openSecs || nowSecs < closeSecs; // wraps midnight
}

// The UTC instant of `hhmmSecs`-seconds-past-midnight on the day `dayOffset`
// days after today, in the shop timezone.
function instantAt(now, dayOffset, secs) {
  const tz = shopTimezone();
  const p = zonedParts(now, tz);
  const base = zonedToUtc(p.year, p.month, p.day, 0, 0, 0, tz);
  // Step whole days via the wall clock so the result is midnight-anchored.
  const stepped = zonedParts(new Date(base.getTime() + dayOffset * 86400000 + 43200000), tz);
  return zonedToUtc(
    stepped.year, stepped.month, stepped.day,
    Math.floor(secs / 3600), Math.floor((secs % 3600) / 60), secs % 60,
    tz
  );
}

// Midnight at the END of today in the shop timezone (i.e. tomorrow 00:00). The
// "Rest of today" pause chip resolves to exactly this instant.
function endOfToday(now) {
  return instantAt(now || new Date(), 1, 0);
}

/**
 * The rule itself, PURE and synchronous, given the live config. Callers that
 * annotate many rows (discovery.list) read the config ONCE and call this per
 * row — that is the whole reason the async wrapper below is separate.
 *
 * `shop` needs: is_open, paused_until, open_time, close_time, and today's
 * closure as either `closed_today` (boolean, from the LEFT JOIN) or a
 * `closure_reason`. A missing field is read the permissive way (open), because
 * a half-loaded row must never invent a closure.
 */
function availabilityWith(shop, now, cfg) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const config = cfg || CONFIG_DEFAULTS;

  // KILL-SWITCH: the platform flag is off -> every shop is open, full stop.
  if (!config.enabled) return { open: true, reason: null, reopens_at: null };

  const s = shop || {};

  // 1. Master switch. No reopen time is knowable — only the owner can flip it.
  if (s.is_open === false) return { open: false, reason: 'closed', reopens_at: null };

  // 2. Short pause. Beats the daily hours: it is the nearer, more specific truth.
  const pausedUntil = s.paused_until ? new Date(s.paused_until) : null;
  if (pausedUntil && !Number.isNaN(pausedUntil.getTime()) && pausedUntil.getTime() > at.getTime()) {
    return { open: false, reason: 'paused', reopens_at: pausedUntil.toISOString() };
  }

  const openSecs = timeToSeconds(s.open_time);
  const closeSecs = timeToSeconds(s.close_time);
  const hasWindow = openSecs != null && closeSecs != null && openSecs !== closeSecs;

  // 3. Festival / holiday closure for today (shop-timezone date).
  if (s.closed_today === true) {
    // Best-effort: the shop reopens when TOMORROW starts — at tomorrow's
    // open_time when it keeps a daily window, else at midnight. A closure
    // tomorrow too would push it further out; we do not read the whole calendar
    // here, and the field is documented as best-effort.
    const reopen = hasWindow ? instantAt(at, 1, openSecs) : instantAt(at, 1, 0);
    return { open: false, reason: 'holiday', reopens_at: reopen.toISOString() };
  }

  // 4. Daily window. Both ends must be set for the window to mean anything.
  if (hasWindow && !insideWindow(secondsOfDay(at), openSecs, closeSecs)) {
    const nowSecs = secondsOfDay(at);
    // Still before today's opening -> today. Already past it -> tomorrow.
    const reopen = nowSecs < openSecs ? instantAt(at, 0, openSecs) : instantAt(at, 1, openSecs);
    return { open: false, reason: 'hours', reopens_at: reopen.toISOString() };
  }

  return { open: true, reason: null, reopens_at: null };
}

/**
 * The documented entry point: read the live platform config, then apply the
 * rule. Use this for a single shop; use getShopHoursConfig() + availabilityWith()
 * when annotating a list so the config is read once, not once per row.
 */
async function availability(shop, now) {
  const cfg = await getShopHoursConfig();
  return availabilityWith(shop, now, cfg);
}

// ---- SQL fragments --------------------------------------------------------
// So a list query can JOIN + annotate + optionally FILTER in ONE query with no
// N+1. These live next to the JS rule on purpose, and `shop-hours.test.js`
// asserts the SQL predicate and availabilityWith() agree across the whole truth
// table — the two can never drift apart unnoticed.

// LEFT JOIN that attaches TODAY's closure (if any) to each shop row.
// `dateParam` is the bind placeholder holding todayKey(), e.g. '$3'.
function closuresJoinSql(shopAlias = 's', joinAlias = 'sc', dateParam = '$1') {
  return `LEFT JOIN shop_closures ${joinAlias}
            ON ${joinAlias}.shop_id = ${shopAlias}.id
           AND ${joinAlias}.on_date = ${dateParam}::date`;
}

// The columns availabilityWith() needs, ready to drop into a SELECT list.
// Prefixed with `_` so callers remember to strip them from the public payload.
function availabilityColumnsSql(shopAlias = 's', joinAlias = 'sc') {
  return `${shopAlias}.is_open AS _is_open,
          ${shopAlias}.paused_until AS _paused_until,
          ${shopAlias}.open_time AS _open_time,
          ${shopAlias}.close_time AS _close_time,
          (${joinAlias}.id IS NOT NULL) AS _closed_today,
          ${joinAlias}.reason AS _closure_reason`;
}

// Pull the `_`-prefixed helper columns off a row and DELETE them, returning the
// plain shape availabilityWith() wants. Keeps the response free of internals.
function takeAvailabilityColumns(row) {
  const shop = {
    is_open: row._is_open,
    paused_until: row._paused_until,
    open_time: row._open_time,
    close_time: row._close_time,
    closed_today: row._closed_today === true,
    closure_reason: row._closure_reason,
  };
  delete row._is_open;
  delete row._paused_until;
  delete row._open_time;
  delete row._close_time;
  delete row._closed_today;
  delete row._closure_reason;
  return shop;
}

// The SAME rule as a SQL boolean, for the optional `?open_now=1` filter — the
// only place the answer must be decided before LIMIT. Read it side by side with
// availabilityWith(): master switch, then pause, then today's closure, then the
// daily window (with the overnight wrap). `tzParam` is the bind placeholder
// holding shopTimezone().
function openPredicateSql(shopAlias = 's', joinAlias = 'sc', tzParam = '$1') {
  const localTime = `(NOW() AT TIME ZONE ${tzParam})::time`;
  return `(${shopAlias}.is_open
           AND (${shopAlias}.paused_until IS NULL OR ${shopAlias}.paused_until <= NOW())
           AND ${joinAlias}.id IS NULL
           AND (${shopAlias}.open_time IS NULL
                OR ${shopAlias}.close_time IS NULL
                OR ${shopAlias}.open_time = ${shopAlias}.close_time
                OR (${shopAlias}.open_time < ${shopAlias}.close_time
                    AND ${localTime} >= ${shopAlias}.open_time
                    AND ${localTime} <  ${shopAlias}.close_time)
                OR (${shopAlias}.open_time > ${shopAlias}.close_time
                    AND (${localTime} >= ${shopAlias}.open_time
                         OR ${localTime} < ${shopAlias}.close_time))))`;
}

// ---- The order-time gate --------------------------------------------------

/**
 * The HARD guarantee. Called INSIDE the order transaction, BEFORE any insert,
 * on the transaction's own client — so a shop that is closed produces no order,
 * no khata transaction and no payment_orders row, whichever payment mode was
 * chosen. Every UI hint elsewhere is courtesy; this is the refusal.
 *
 * Throws 409 `shop_closed` with details { reason, reopens_at } so a client can
 * say WHY and WHEN rather than dumping a raw error. Returns the availability
 * when the shop is open.
 */
async function assertShopOpenTx(client, shopId, now) {
  const cfg = await getShopHoursConfig();
  if (!cfg.enabled) return { open: true, reason: null, reopens_at: null };

  const at = now || new Date();
  const r = await client.query(
    `SELECT ${availabilityColumnsSql('s', 'sc')}
       FROM shops s
       ${closuresJoinSql('s', 'sc', '$2')}
      WHERE s.id = $1`,
    [shopId, todayKey(at)]
  );
  if (!r.rowCount) throw ApiError.notFound('Shop not found');

  const state = takeAvailabilityColumns(r.rows[0]);
  const a = availabilityWith(state, at, cfg);
  if (!a.open) {
    throw ApiError.conflict('shop_closed', { reason: a.reason, reopens_at: a.reopens_at });
  }
  return a;
}

// ---- Pause helpers --------------------------------------------------------

/**
 * Resolve a requested pause into an absolute `paused_until` instant.
 *   0 (or anything <= 0)  -> null, i.e. CLEAR the pause ("Resume now")
 *   'today'               -> midnight at the end of today in the shop timezone
 *                            (the "Rest of today" chip — no time picker)
 *   n minutes             -> clamped to 1..cfg.pause_max_minutes
 * Garbage falls back to the platform maximum rather than to something unbounded.
 * 'today' is clamped by the same ceiling, so the platform guard rail always
 * holds; with the default 24h ceiling it is never truncated.
 */
function resolvePauseUntil(minutes, cfg, now) {
  const config = cfg || CONFIG_DEFAULTS;
  const at = now || new Date();
  if (typeof minutes === 'string' && minutes.trim().toLowerCase() === 'today') {
    const midnight = endOfToday(at);
    const capped = new Date(at.getTime() + config.pause_max_minutes * 60000);
    return midnight.getTime() < capped.getTime() ? midnight : capped;
  }
  const n = parseInt(minutes, 10);
  if (!Number.isFinite(n)) return new Date(at.getTime() + config.pause_max_minutes * 60000);
  if (n <= 0) return null; // clear
  const clamped = Math.min(config.pause_max_minutes, Math.max(1, n));
  return new Date(at.getTime() + clamped * 60000);
}

module.exports = {
  // the rule
  availability,
  availabilityWith,
  getShopHoursConfig,
  // timezone + time helpers (one resolution point for the whole app)
  shopTimezone,
  todayKey,
  endOfToday,
  normalizeHm,
  timeToSeconds,
  // SQL fragments
  closuresJoinSql,
  availabilityColumnsSql,
  takeAvailabilityColumns,
  openPredicateSql,
  // gates + pause
  assertShopOpenTx,
  resolvePauseUntil,
  CONFIG_DEFAULTS,
  DEFAULT_TZ,
};
