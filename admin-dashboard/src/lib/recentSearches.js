// "Recent searches" for the consumer PWA: the shopper's own last few words.
//
// LOCAL ONLY, and that is the point. There is no endpoint behind this list and
// there should never be one: a rural shopper's recent searches are a record of
// what their household ran out of this week. That is not ours to collect and not
// worth a byte of their data to upload. So this is ONE localStorage key, it is
// never synced, it is never sent with a search, and signing out does not clear
// it — the Clear control is what clears it, because the list is not tied to an
// account.
//
// NOTHING HERE THROWS. A private window, a blocked store or a corrupt value
// reads as "no recent searches", which renders as nothing at all — exactly what
// a brand-new shopper sees, and a state the screen is designed to be good at.
//
// The list algebra below is the same as the native app's
// (mobile-app/src/consumer/lib/recentSearches.js); only the storage half
// differs, because the app has expo-secure-store and a browser has
// localStorage.

export const RECENT_KEY = 'ckhata_recent_searches';

// Six is what fits above the fold on a 360px screen beside everything else this
// screen has to show, and a shopper does not remember further back than that.
export const RECENT_MAX = 6;

// A term longer than this is a paste or a speech-recognition run-on, not a
// grocery item.
export const TERM_MAX = 40;

// Collapse whitespace, trim, and cap. Returns '' for anything unusable, which
// every caller treats as "do not store this".
export function cleanTerm(value) {
  const s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return s.length > TERM_MAX ? s.slice(0, TERM_MAX).trim() : s;
}

// Put `term` at the front, most recent first, with no duplicate.
//
// De-duplication is case- and spacing-insensitive but the list keeps the LATEST
// spelling: someone who searched "Toor Dal" and later "toor dal" has one entry,
// and it reads back the way they last typed it. A shelf chip is deliberately
// NOT recorded — a chip is one tap away already, and filling this list with the
// six chips would push the shopper's own words off the end of it.
export function addRecentTerm(list, term) {
  const clean = cleanTerm(term);
  if (!clean) return Array.isArray(list) ? list.slice(0, RECENT_MAX) : [];
  const key = clean.toLowerCase();
  const rest = (Array.isArray(list) ? list : []).filter(
    (t) => typeof t === 'string' && t.toLowerCase() !== key
  );
  return [clean, ...rest].slice(0, RECENT_MAX);
}

// Parse whatever came back out of storage. Anything that is not a clean array of
// usable strings reads as an empty list — a corrupt value must never be an error
// on a screen a shopper opened to buy atta.
export function parseRecent(raw) {
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out = [];
  const seen = Object.create(null);
  for (const entry of parsed) {
    if (typeof entry !== 'string') continue;
    const clean = cleanTerm(entry);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    out.push(clean);
    if (out.length >= RECENT_MAX) break;
  }
  return out;
}

export function serializeRecent(list) {
  return JSON.stringify((Array.isArray(list) ? list : []).slice(0, RECENT_MAX));
}

// ---- the one key on the device ------------------------------------------
// Synchronous, because localStorage is: the screen can render the list on its
// first paint instead of flashing an empty section and filling it in.

function readRaw() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(RECENT_KEY);
  } catch (e) {
    return null; // private window / site data blocked
  }
}

export function loadRecentSearches() {
  return parseRecent(readRaw());
}

// Record a term and return the list as it now stands, so a caller can set state
// from the result rather than re-reading storage. A failed write is swallowed:
// losing a recent search costs nothing, and letting a storage error reach a
// shopper mid-search would cost everything.
export function rememberSearch(term) {
  const next = addRecentTerm(parseRecent(readRaw()), term);
  if (typeof window !== 'undefined') {
    try {
      if (next.length) window.localStorage.setItem(RECENT_KEY, serializeRecent(next));
    } catch (e) { /* the list is still right in memory for this session */ }
  }
  return next;
}

export function clearRecentSearches() {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(RECENT_KEY);
    } catch (e) { /* ignore */ }
  }
  return [];
}
