// Shop availability (batch A) — the RENDERING side of the one truth.
//
// The backend's src/utils/shopOpen.js decides whether a shop is open; it hands
// every surface the SAME object:
//
//   availability: { open, reason, reopens_at }
//
// This module does not re-decide anything. It only turns that object into the
// one sentence the owner console and the consumer PWA both show, so "Closed"
// never appears bare — a shopper always learns WHY and WHEN it reopens. The
// native app has the mirror of this file at mobile-app/src/lib/shopOpen.js.

// `availability` may be missing entirely on an older/offline payload. Treat a
// missing object as OPEN: the server refuses a closed shop at order time
// anyway, so guessing "closed" here would only hide a working shop.
export function isOpen(availability) {
  return !availability || availability.open !== false;
}

// A locale tag for Intl from the app's 2-letter language. India-first, and any
// value Intl rejects falls back to the browser default rather than throwing.
function localeFor(lang) {
  return lang ? `${lang}-IN` : undefined;
}

// 'h:mm AM/PM' for an ISO instant, in the viewer's locale.
function timeOnly(iso, lang) {
  try {
    return new Intl.DateTimeFormat(localeFor(lang), { hour: 'numeric', minute: '2-digit' })
      .format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleTimeString();
  }
}

// A short, human "when": just the time for later today, "tomorrow at …" for
// tomorrow, and a weekday + time further out. Anything unparseable returns ''
// so the caller can fall back to a bare state line instead of printing junk.
export function formatWhen(t, iso, lang) {
  if (!iso) return '';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '';
  const now = new Date();
  const dayDiff = Math.round(
    (new Date(when.getFullYear(), when.getMonth(), when.getDate()) -
      new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000
  );
  const time = timeOnly(iso, lang);
  if (dayDiff <= 0) return t('open.todayAt', { time });
  if (dayDiff === 1) return t('open.tomorrowAt', { time });
  try {
    return new Intl.DateTimeFormat(localeFor(lang), {
      weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
    }).format(when);
  } catch {
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
 * The short pill/badge text for a shop card: '' when open, else "Closed".
 * The full explanation goes next to it via availabilityLine().
 */
export function availabilityPill(t, availability) {
  return isOpen(availability) ? '' : t('open.closedPill');
}

/**
 * Turn the API's 409 into something a shopper can read. The backend answers
 * `{ error: 'shop_closed', details: { reason, reopens_at } }`; anything else is
 * passed through untouched so real errors are never swallowed.
 */
export function shopClosedMessage(t, err, lang) {
  const details = err && (err.details || (err.body && err.body.details));
  const code = err && (err.code || err.error || err.message);
  if (code !== 'shop_closed' && !(details && details.reason)) return null;
  const line = availabilityLine(t, { open: false, reason: details?.reason, reopens_at: details?.reopens_at }, lang);
  return line ? `${t('open.cartBlocked')} ${line}` : t('open.cartBlocked');
}
