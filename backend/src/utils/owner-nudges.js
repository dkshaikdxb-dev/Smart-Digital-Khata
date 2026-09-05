// Owner Help "lane A" — plain-language shop nudges (Phase F). PURE and
// DETERMINISTIC: given an already-aggregated, SHOP-SCOPED `data` payload (built
// by the owner-insights controller from the shop's OWN rows), it returns an
// ordered list of one-line nudge cards for the owner home. No I/O, no clock, no
// randomness, no AI — the same `data` always yields the same nudges, so it is
// trivially unit-testable. The controller derives "today"/now ONCE (via the DB
// day boundary) and passes the numbers in; nothing here reads the clock.
//
// This is the OWNER-facing analog of the admin insights engine (utils/insights):
// same shape of rule → card, but every figure is the shop's own data. Money is
// integer paise everywhere (the UI renders rupees). Each card carries:
//   { id, tone, icon, key, vars, amount_paise? }
// where `key` is an i18n template id and `vars` fills its {placeholders}. Counts
// and amounts are passed as plain NUMBERS (never pre-rendered Latin digits) so a
// language like Urdu can interpolate them RTL-safely.

// ---- Named thresholds ----------------------------------------------------
// Every magic number a rule fires on lives here so the numbers can be tuned in
// one place instead of hunting through the logic (mirrors utils/insights).
const THRESHOLDS = Object.freeze({
  // A due is "stale" once the customer's last activity is this many days old.
  DUES_STALE_DAYS: 30,
  // A customer at or above this percent of their credit_limit is "near limit".
  NEAR_LIMIT_PCT: 90,
  // Only mention "more/less than usual" when today differs from the trailing
  // daily average by at least this much (₹100) — avoids noisy tiny deltas.
  COLLECTED_DELTA_MIN_PAISE: 10000,
  // Window (days) the trailing daily average of collections is taken over.
  TRAILING_AVG_DAYS: 7,
  // Best-selling item is measured over this many trailing days.
  TOP_ITEM_WINDOW_DAYS: 7,
  // The "busy day" is the busiest weekday over this many trailing weeks.
  BUSY_DAY_WINDOW_WEEKS: 4,
});

// A calm, fixed narrative order (good news → things to watch → context). Kept as
// an explicit list so ordering is fully deterministic and easy to reason about;
// tone drives COLOUR in the UI, not order (these nudges are informational, not
// alarms). Any id not listed sorts last, then ties break by id.
const ORDER = Object.freeze([
  'collected_today',
  'dues_pending',
  'near_limit',
  'outstanding_total',
  'top_item',
  'busy_day',
]);

function rank(id) {
  const i = ORDER.indexOf(id);
  return i === -1 ? ORDER.length : i;
}

// Coerce a possibly-bigint/string DB value to a finite JS number (0 on garbage).
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Paise → a clean rupee NUMBER for interpolation: whole rupees stay integers
// (₹150, not ₹150.00), otherwise two decimals. Returned as a Number so the
// value is data, not a hardcoded digit string.
function paiseToRupees(paise) {
  const p = Math.round(num(paise));
  const rupees = p / 100;
  return Number.isInteger(rupees) ? rupees : Math.round(rupees * 100) / 100;
}

// buildOwnerNudges(data) → ordered array of nudge cards.
//
// `data` (all shop-scoped, all integer paise unless a count/index) is:
//   payments_today_paise      today's cash+upi collections
//   trailing_daily_avg_paise  average daily collections over TRAILING_AVG_DAYS
//   dues_count                # active customers owing, last activity ≥ stale days
//   dues_total_paise          Σ of those customers' balances
//   outstanding_total_paise   Σ of ALL positive balances (total udhaar)
//   near_limit_count          # customers at ≥ NEAR_LIMIT_PCT of a real limit
//   top_item                  { name, quantity } best-seller in the window, or null
//   busy_day                  { dow, count } busiest weekday (dow 0=Sun..6=Sat), or null
function buildOwnerNudges(data = {}) {
  const out = [];

  const today = num(data.payments_today_paise);
  const avg = num(data.trailing_daily_avg_paise);

  // collected_today — today's collections, with an optional "more/less than
  // usual" clause when it clearly differs from the trailing daily average.
  if (today > 0) {
    const delta = today - avg;
    const bigDelta = avg > 0 && Math.abs(delta) >= THRESHOLDS.COLLECTED_DELTA_MIN_PAISE;
    let key = 'own.nudge.collected_today';
    const vars = { amount: paiseToRupees(today) };
    let amountPaise = today;
    if (bigDelta) {
      key = delta > 0 ? 'own.nudge.collected_today_up' : 'own.nudge.collected_today_down';
      vars.delta = paiseToRupees(Math.abs(delta));
    }
    out.push({
      id: 'collected_today',
      tone: 'good',
      icon: '💰',
      key,
      vars,
      amount_paise: amountPaise,
      ...(bigDelta ? { delta_paise: Math.abs(delta) } : {}),
    });
  }

  // dues_pending — customers whose dues have gone quiet (stale). Actionable:
  // the UI links this to the customers/reminders view.
  const duesCount = num(data.dues_count);
  if (duesCount > 0) {
    out.push({
      id: 'dues_pending',
      tone: 'attention',
      icon: '⏰',
      key: 'own.nudge.dues_pending',
      vars: {
        n: duesCount,
        days: THRESHOLDS.DUES_STALE_DAYS,
        amount: paiseToRupees(data.dues_total_paise),
      },
      amount_paise: num(data.dues_total_paise),
      action: 'remind',
    });
  }

  // near_limit — customers close to their credit limit (watch before it trips).
  const nearLimit = num(data.near_limit_count);
  if (nearLimit > 0) {
    out.push({
      id: 'near_limit',
      tone: 'attention',
      icon: '⚠️',
      key: 'own.nudge.near_limit',
      vars: { n: nearLimit, pct: THRESHOLDS.NEAR_LIMIT_PCT },
    });
  }

  // outstanding_total — total udhaar still on the books.
  const outstanding = num(data.outstanding_total_paise);
  if (outstanding > 0) {
    out.push({
      id: 'outstanding_total',
      tone: 'info',
      icon: '📒',
      key: 'own.nudge.outstanding_total',
      vars: { amount: paiseToRupees(outstanding) },
      amount_paise: outstanding,
    });
  }

  // top_item — best-selling product in the recent window (only when orders exist).
  if (data.top_item && data.top_item.name) {
    out.push({
      id: 'top_item',
      tone: 'info',
      icon: '⭐',
      key: 'own.nudge.top_item',
      vars: { item: data.top_item.name, days: THRESHOLDS.TOP_ITEM_WINDOW_DAYS },
    });
  }

  // busy_day — the busiest weekday over the trailing weeks. `dow` is passed as an
  // index (0=Sunday..6=Saturday); the UI maps it to a localized weekday name.
  if (data.busy_day && Number.isFinite(Number(data.busy_day.dow))) {
    out.push({
      id: 'busy_day',
      tone: 'info',
      icon: '📅',
      key: 'own.nudge.busy_day',
      vars: { dow: Number(data.busy_day.dow) },
    });
  }

  // Stable, deterministic ordering: fixed narrative rank, then id as a tiebreak.
  out.sort((a, b) => {
    const r = rank(a.id) - rank(b.id);
    if (r !== 0) return r;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return out;
}

module.exports = { buildOwnerNudges, THRESHOLDS };
