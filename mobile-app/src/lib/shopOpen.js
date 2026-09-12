// Shop availability (batch A) — the RENDERING side of the one truth, for BOTH
// native flavors (owner and consumer import this same file).
//
// The backend's src/utils/shopOpen.js decides whether a shop is open and hands
// every surface the SAME object:
//
//   availability: { open, reason, reopens_at }
//
// Nothing here re-decides anything. It only turns that object into the one
// sentence the owner app and the consumer app show, so "Closed" never appears
// bare — a shopper always learns WHY and WHEN it reopens. The web mirror of
// this file is admin-dashboard/src/lib/shopOpen.js, with the same key names.
//
// OTA-SAFE: pure JavaScript, no imports at all. Nothing is added to
// package.json and no native module is touched, so this ships in an
// over-the-air update like any other JS change.

// `availability` may be missing entirely on an older/offline payload. Treat a
// missing object as OPEN: the server refuses a closed shop at order time
// anyway, so guessing "closed" here would only hide a working shop.
export function isOpen(availability) {
  return !availability || availability.open !== false;
}

// A locale tag for Intl from the app's 2-letter language. India-first, and any
// value Intl rejects falls back to the device default rather than throwing.
// (Hermes ships Intl.DateTimeFormat; the try/catch covers older engines where
// only the toLocale* fallback exists.)
function localeFor(lang) {
  return lang ? `${lang}-IN` : undefined;
}

function timeOnly(date, lang) {
  try {
    return new Intl.DateTimeFormat(localeFor(lang), { hour: 'numeric', minute: '2-digit' }).format(date);
  } catch (e) {
    return date.toLocaleTimeString();
  }
}

// A short, human "when": just the time for later today, "tomorrow at …" for
// tomorrow, and a date + time further out. Anything unparseable returns '' so
// the caller falls back to a bare state line instead of printing junk.
export function formatWhen(t, iso, lang) {
  if (!iso) return '';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '';
  const now = new Date();
  const dayDiff = Math.round(
    (new Date(when.getFullYear(), when.getMonth(), when.getDate()) -
      new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000
  );
  const time = timeOnly(when, lang);
  if (dayDiff <= 0) return t('open.todayAt', { time });
  if (dayDiff === 1) return t('open.tomorrowAt', { time });
  try {
    return new Intl.DateTimeFormat(localeFor(lang), {
      weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
    }).format(when);
  } catch (e) {
    return when.toLocaleString();
  }
}

/**
 * The ONE sentence for a closed shop: the reason plus, wherever the server
 * could work one out, the reopen time. Returns '' when the shop is open.
 *
 * `reason` values come straight from the backend helper:
 *   'closed'  the owner switched the shop off   (no reopen time is knowable)
 *   'paused'  a short pause is still running
 *   'holiday' a festival/holiday closure for today
 *   'hours'   outside the daily open..close window
 */
export function availabilityLine(t, availability, lang, opts) {
  if (isOpen(availability)) return '';
  const when = formatWhen(t, availability.reopens_at, lang);
  const reason = opts && opts.reason;
  switch (availability.reason) {
    case 'paused':
      return when ? t('open.statePaused', { when }) : t('open.closed');
    case 'holiday':
      if (reason) return t('open.stateHolidayReason', { reason, when });
      return when ? t('open.stateHoliday', { when }) : t('open.closed');
    case 'hours':
      return when ? t('open.stateHours', { when }) : t('open.closed');
    case 'closed':
    default:
      return t('open.stateClosed');
  }
}

/**
 * Turn the API's 409 into something a shopper can read. The axios clients
 * normalize an error to a plain Error carrying the server's message; this also
 * reads the raw `response.data.details` so `{ reason, reopens_at }` survives.
 * Returns null for anything that is NOT a `shop_closed` refusal, so real errors
 * are never swallowed.
 */
export function shopClosedMessage(t, err, lang) {
  const data = (err && err.response && err.response.data) || null;
  const details = (err && err.details) || (data && data.details) || null;
  const code = (err && err.code) || (data && data.error) || (err && err.message);
  if (code !== 'shop_closed' && !(details && details.reason)) return null;
  const line = availabilityLine(
    t,
    { open: false, reason: details && details.reason, reopens_at: details && details.reopens_at },
    lang
  );
  return line ? `${t('open.cartBlocked')} ${line}` : t('open.cartBlocked');
}
