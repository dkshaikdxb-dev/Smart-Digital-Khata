// The pure parts of the festive-theme desk: reading and writing a window's
// dates, and saying what state a window is in.
//
// Separate from the page so they can be tested. Both are places a plausible
// shortcut is wrong, and neither is visible from a screenshot.

/**
 * An ISO instant -> the value an <input type="datetime-local"> wants, in the
 * OPERATOR'S OWN ZONE.
 *
 * The referral desk beside this one uses date-only inputs, and for a theme that
 * would be a bug rather than a simplification: a bare '2026-11-08' parses as
 * midnight UTC, which is half past five in the morning in India. A Diwali theme
 * set that way lights up late on its first day and goes dark before the last one
 * is over — the two days it most needed to be right.
 */
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** The same value back to an ISO instant, or null when there is nothing there. */
export function fromLocalInput(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * What state a window is in, as one of:
 *   live | draft | paused | ended | scheduled
 *
 * IS_LIVE IS THE SERVER'S ANSWER AND IS NEVER OVERRULED. It is computed by the
 * same NOW() the resolver uses, so it agrees with the colour the apps are
 * actually being sent. Working it out again from the dates would put a second
 * copy of that rule in a browser whose clock is its own, and the two copies
 * would disagree on exactly the day somebody cares about.
 *
 * The dates are read only to say WHY a window that is active is still not
 * painting — before its start, or past its end.
 */
export function windowState(c, now = Date.now()) {
  if (!c) return 'ended';
  if (c.is_live) return 'live';
  if (c.status === 'draft') return 'draft';
  if (c.status === 'paused') return 'paused';
  if (c.status === 'ended') return 'ended';
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return 'scheduled';
  return 'ended';
}
