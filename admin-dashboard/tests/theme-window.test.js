/**
 * The festive-theme desk's two pieces of logic that a screenshot cannot check.
 *
 * Both are cases where the obvious shortcut is wrong on exactly the day the
 * feature exists for: the first day of a festival, and the last one.
 */
const { toLocalInput, fromLocalInput, windowState } = require('../src/lib/themeWindow.js');

describe('a window\'s dates survive the round trip through the form', () => {
  it('gives back the same wall-clock value it was handed', () => {
    for (const v of ['2026-11-08T00:00', '2026-11-10T23:59', '2027-01-14T06:30']) {
      expect(toLocalInput(fromLocalInput(v))).toBe(v);
    }
  });

  it('a typed midnight IS midnight where the operator is standing', () => {
    // The whole reason this desk uses datetime-local instead of the date-only
    // input the referral desk uses. `new Date('2026-11-08')` is midnight UTC —
    // 5:30am in India — so a date-only Diwali window would start late and end
    // early. This asserts the property that fixes it, in any timezone the test
    // happens to run in.
    const d = new Date(fromLocalInput('2026-11-08T00:00'));
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(10);   // November
    expect(d.getDate()).toBe(8);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it('an empty field is an open end, not the epoch', () => {
    expect(fromLocalInput('')).toBeNull();
    expect(fromLocalInput(null)).toBeNull();
    expect(fromLocalInput(undefined)).toBeNull();
    expect(toLocalInput(null)).toBe('');
    expect(toLocalInput('')).toBe('');
  });

  it('a value that is not a date is dropped rather than guessed at', () => {
    expect(fromLocalInput('next Diwali')).toBeNull();
    expect(toLocalInput('next Diwali')).toBe('');
  });

  it('pads single-digit months, days, hours and minutes', () => {
    // An unpadded '2026-1-5T9:05' is not a value the input will accept, so it
    // would silently render an empty field over a window that does have dates.
    const iso = fromLocalInput('2026-01-05T09:05');
    expect(toLocalInput(iso)).toBe('2026-01-05T09:05');
  });
});

describe('what state a window is in', () => {
  const HOUR = 3600 * 1000;
  const now = Date.parse('2026-11-08T12:00:00Z');
  const past = new Date(now - 48 * HOUR).toISOString();
  const future = new Date(now + 48 * HOUR).toISOString();

  it('says live when, and only when, the SERVER says it is live', () => {
    expect(windowState({ status: 'active', is_live: true, starts_at: past, ends_at: future }, now)).toBe('live');
  });

  it('does not overrule the server with the browser\'s own clock', () => {
    // Dates that look live from here, but the server — whose NOW() is the one
    // the resolver used — says otherwise. The server wins, because it is the
    // clock the apps are actually being answered by.
    expect(windowState({ status: 'active', is_live: false, starts_at: past, ends_at: future }, now)).toBe('ended');
  });

  it('names why an active window is not painting', () => {
    expect(windowState({ status: 'active', is_live: false, starts_at: future }, now)).toBe('scheduled');
    expect(windowState({ status: 'active', is_live: false, starts_at: past, ends_at: past }, now)).toBe('ended');
  });

  it('reports draft, paused and ended as themselves', () => {
    expect(windowState({ status: 'draft', is_live: false }, now)).toBe('draft');
    expect(windowState({ status: 'paused', is_live: false, starts_at: past, ends_at: future }, now)).toBe('paused');
    expect(windowState({ status: 'ended', is_live: false }, now)).toBe('ended');
  });

  it('a window with no dates at all is live when the server says so', () => {
    expect(windowState({ status: 'active', is_live: true }, now)).toBe('live');
    expect(windowState({ status: 'active', is_live: false }, now)).toBe('ended');
  });

  it('nothing at all is not a crash', () => {
    expect(windowState(null, now)).toBe('ended');
    expect(windowState(undefined, now)).toBe('ended');
  });
});
