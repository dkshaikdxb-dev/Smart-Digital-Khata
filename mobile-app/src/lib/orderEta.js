// Ready-time promise (batch B) — the RENDERING side of the one truth, for BOTH
// native flavors (the owner app and the consumer app import this same file).
//
// The backend's src/utils/orderEta.js decides the chips and the ceiling, and
// order.controller stamps the promise as an ABSOLUTE instant on the order:
//
//   order.eta_minutes   the chip the owner tapped (or null)
//   order.promised_at   the instant it resolved to (or null)
//
// Nothing here re-decides anything. It turns those two fields into the words a
// person reads, and it is the ONLY place that decides when a promise has passed.
// The web mirror of this file is admin-dashboard/src/lib/orderEta.js, with the
// same function and key names, so the four surfaces never word the same fact
// differently.
//
// OTA-SAFE: pure JavaScript, no imports at all. Nothing is added to
// package.json and no native module is touched, so this ships in an
// over-the-air update like any other JS change.

// The statuses at which a ready-time promise is still something the customer is
// waiting on. Once the order is 'ready' (or beyond), the promise has been kept
// or overtaken and there is nothing left to count down to.
const PENDING_PROMISE = ['pending', 'accepted', 'preparing'];

/**
 * The promise's state for a given order, right now:
 *   'none'      no promise was ever made (and none is ever invented)
 *   'promised'  a promise is outstanding and still in the future
 *   'late'      the promised time has passed and the order is not ready yet
 *   'settled'   the order is ready/out for delivery/complete/cancelled — the
 *               promise no longer applies, so no surface counts down at it
 */
export function etaState(order, now) {
  if (!order || !order.promised_at) return 'none';
  const at = new Date(order.promised_at);
  if (Number.isNaN(at.getTime())) return 'none';
  if (PENDING_PROMISE.indexOf(order.status) < 0) return 'settled';
  const t = now ? new Date(now).getTime() : Date.now();
  return at.getTime() >= t ? 'promised' : 'late';
}

// A locale tag for Intl from the app's 2-letter language. India-first, and any
// value Intl rejects falls back to the device default rather than throwing.
// (Hermes ships Intl.DateTimeFormat; the try/catch covers older engines.)
function localeFor(lang) {
  return lang ? `${lang}-IN` : 'en-IN';
}

/**
 * A promised instant as a clock time, e.g. "4:45 PM". The customer's WhatsApp
 * message says the same thing (backend utils/order-customer-copy.formatClock),
 * so the screen and the message never disagree. Returns '' for anything
 * unparseable, so a caller falls back to wording with no time in it rather than
 * printing "Invalid Date" at a customer.
 */
export function formatClock(iso, lang) {
  if (!iso) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(localeFor(lang), { hour: 'numeric', minute: '2-digit' }).format(at);
  } catch (e) {
    return at.toLocaleTimeString();
  }
}

/**
 * The label on one coarse chip: "~15 min", "~1 hour", "~1 hr 30 min". Built from
 * minutes so the labels follow whatever chips the platform is configured with —
 * a client never hardcodes 15/30/60.
 */
export function chipLabel(t, minutes) {
  const n = Math.max(1, Math.round(Number(minutes) || 0));
  if (n < 60) return t('eta.chipMin', { n });
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (m === 0) return t('eta.chipHour', { n: h });
  return t('eta.chipHourMin', { h, m });
}

/**
 * The one sentence a CUSTOMER reads about the promise, or '' when there is
 * nothing honest to say. A passed promise is deliberately gentle: the shopkeeper
 * is a neighbour who is busy, not a courier breaching an SLA.
 */
export function customerEtaText(t, order, lang) {
  const state = etaState(order);
  if (state === 'promised') return t('eta.readyBy', { time: formatClock(order.promised_at, lang) });
  if (state === 'late') return t('eta.takingLonger');
  return '';
}

/** The chip list to offer, falling back to the platform defaults while the live config loads. */
export const DEFAULT_CHIPS = [15, 30, 60];
