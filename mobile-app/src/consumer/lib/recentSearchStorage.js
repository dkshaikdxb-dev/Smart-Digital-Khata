import * as SecureStore from 'expo-secure-store';
import { addRecentTerm, parseRecent, serializeRecent } from './recentSearches';

// Persistence for "Recent searches": ONE key in expo-secure-store, which the
// app already depends on (the language choice, the data-saver flag and the
// saved carts all live there), so this ships over the air with no new
// dependency and no change to app.config.js.
//
// LOCAL ONLY. There is no endpoint behind this and there never should be. It is
// not synced, not sent with a search, and not readable by anything but this
// install. Signing out does not clear it because it is not tied to an account;
// the Clear control is.
//
// Nothing here throws. A blocked, full or corrupt store reads as "no recent
// searches", which renders as nothing at all — exactly what a brand-new shopper
// sees, and a state this screen is designed to be good at.

const KEY = 'skhata_consumer_recent_searches';

export async function loadRecentSearches() {
  try {
    return parseRecent(await SecureStore.getItemAsync(KEY));
  } catch (e) {
    return [];
  }
}

// Record a term and return the list as it now stands, so a caller can set state
// from the result rather than re-reading storage. The write is awaited but a
// failure is swallowed: losing a recent search costs nothing, and blocking the
// search itself on a keystore write would cost everything.
export async function rememberSearch(term) {
  let current = [];
  try {
    current = parseRecent(await SecureStore.getItemAsync(KEY));
  } catch (e) { /* start from empty */ }
  const next = addRecentTerm(current, term);
  // Nothing changed (same term, already at the front) — skip the write.
  if (next.length === current.length && next.every((t, i) => t === current[i])) return current;
  try {
    await SecureStore.setItemAsync(KEY, serializeRecent(next));
  } catch (e) { /* the list is still right in memory for this session */ }
  return next;
}

export async function clearRecentSearches() {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch (e) { /* ignore */ }
  return [];
}
