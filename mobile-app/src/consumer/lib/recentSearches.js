// The list algebra behind "Recent searches", with no storage and no imports so
// it can be tested on its own (scripts/mobile-consumer-logic.test.mjs runs this
// file directly). The expo-secure-store half lives in recentSearchStorage.js.
//
// These terms are the shopper's OWN and they never leave the handset: there is
// no endpoint for them, nothing is synced, and nothing is sent with a search.
// A rural shopper's recent searches are a list of what their household ran out
// of this week, which is not ours to collect and not worth a byte of their data
// to upload.

// Six is what fits above the fold on a 360dp screen beside everything else this
// screen has to show, and a shopper does not remember further back than that.
export const RECENT_MAX = 6;

// A term longer than this is a paste or an ASR run-on, not a grocery item. It
// also keeps the whole stored value far inside Android's 2048-byte SecureStore
// ceiling (see cartStorage.js for what happens when that is ignored).
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
// NOT recorded here — a chip is one tap away already, and filling this list
// with the six chips would push the shopper's own words off the end of it.
export function addRecentTerm(list, term) {
  const clean = cleanTerm(term);
  if (!clean) return Array.isArray(list) ? list.slice(0, RECENT_MAX) : [];
  const key = clean.toLowerCase();
  const rest = (Array.isArray(list) ? list : []).filter(
    (t) => typeof t === 'string' && t.toLowerCase() !== key
  );
  return [clean, ...rest].slice(0, RECENT_MAX);
}

// Parse whatever came back out of storage. Anything that is not a clean array
// of usable strings reads as an empty list — a corrupt value must never be an
// error on a screen a shopper opened to buy atta.
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
  const seen = {};
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
