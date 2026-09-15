// Plain YYYY-MM-DD helpers for the statement date range.
//
// The native app has no date picker and cannot grow one: every RN date picker
// is a native module, and a native module means an EAS rebuild, which would
// make this whole batch un-shippable over the air. So the range is two typed
// fields plus preset buttons, and these helpers are what make typed input safe.
//
// `isIsoDay` is stricter than Date.parse on purpose. Date.parse happily accepts
// '2024-02-31' and silently rolls it to 2 March, which would quietly hand the
// server a range the shopper did not ask for; here the round trip through a
// real Date must come back byte-identical or the input is rejected.
//
// Pure, no imports, UTC-only arithmetic so a device in IST never lands a day
// either side of the one the shopper tapped.

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** A Date (or now) as YYYY-MM-DD in UTC. */
export function isoDay(d = new Date()) {
  const t = d instanceof Date ? d : new Date(d);
  if (!Number.isFinite(t.getTime())) return '';
  return t.toISOString().slice(0, 10);
}

/** YYYY-MM-DD for N days before `from` (default today). */
export function daysAgo(n, from = new Date()) {
  const base = from instanceof Date ? from.getTime() : new Date(from).getTime();
  if (!Number.isFinite(base)) return '';
  return isoDay(new Date(base - Math.max(0, Number(n) || 0) * 86400000));
}

/** True only for a well-formed AND real calendar day. */
export function isIsoDay(s) {
  const v = String(s == null ? '' : s).trim();
  if (!ISO.test(v)) return false;
  const d = new Date(`${v}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return false;
  // Rejects 2024-02-31 and friends, which Date would otherwise roll forward.
  return d.toISOString().slice(0, 10) === v;
}

/**
 * Validate a range the way the server does before spending a request on it.
 * Returns null when it is fine, or 'format' / 'order' naming what is wrong, so
 * the caller picks the sentence rather than this file inventing one.
 */
export function rangeProblem(from, to) {
  if (!isIsoDay(from) || !isIsoDay(to)) return 'format';
  if (String(from) > String(to)) return 'order';
  return null;
}
