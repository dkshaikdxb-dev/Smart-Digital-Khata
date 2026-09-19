// Establishing the accent BEFORE the screens exist.
//
// THE PROBLEM THIS SOLVES. Of the 71 consumer references the platform colour
// reaches, 59 sit inside a module-level StyleSheet.create, which React Native
// evaluates the moment the module is imported. Change the colour after that and
// 12 inline references repaint while 59 stay green — a half-themed screen,
// which looks broken in a way that not theming at all does not. So the colour
// has to be in place before the screen modules are evaluated, and the only way
// to guarantee that is to not import them until it is. App.js therefore
// require()s the tree instead of importing it, and this module is what runs in
// between.
//
// (The app's other 6 accent-family references are colors.positive and are never
// repainted at all — see src/consumer/theme.js.)
//
// THE ORDER, AND WHY EACH STEP IS WHERE IT IS:
//
//   1. read the CACHED accent from SecureStore        (fast, local, offline)
//   2. write it into both theme objects
//   3. --- only now may the screen tree be imported ---
//   4. ask the server, and cache the answer for the NEXT start
//
// The network is deliberately NOT in the boot path. A shopper on 2G would wait
// on a decoration, and a shopper with no signal would wait on nothing at all.
// The cost is that a colour changed on the server appears one launch later,
// which for a festival scheduled days ahead is not a cost.
//
// Nothing here can fail loudly. Every step swallows its own error and leaves
// the colour as whatever the last good value was — the cached one, or failing
// that the green the app ships with. An accent that fails open to no accent
// would be worse than one that never changed.
import * as SecureStore from 'expo-secure-store';

import { applyAccent as applyConsumer, DEFAULT_ACCENT } from './consumer/theme';
import { applyAccent as applyOwner } from './theme';
import { ACCENT_KEY, isHex, chooseAccent, fetchAccent, cacheAccent } from './consumer/lib/accent';

export { DEFAULT_ACCENT };

// Both flavors are repainted together. Only one of them is ever on screen, but
// which one is a build-time flavor and keeping the two in step here means the
// boot gate does not have to know or care.
function paint(hex) {
  applyConsumer(hex);
  applyOwner(hex);
  return hex;
}

/**
 * Step 1–2: put a colour in place, from the cache or from the default.
 *
 * Mirrors how the language is restored (src/i18n.js loadStoredLang): read
 * SecureStore, accept only a value of the shape we wrote, swallow anything
 * else, fall back. A malformed cached value is treated as ABSENT and never
 * repaired — '#22C55E' or '2c5' coming back out means something wrote a shape
 * this app does not write, and rescuing it would paint a colour nobody chose.
 *
 * Resolves to { accent, from } where `from` is 'cache' or 'default', so the
 * caller and the tests can say which path was taken.
 */
export async function establishAccent(store = SecureStore) {
  let cached = null;
  try {
    const v = await store.getItemAsync(ACCENT_KEY);
    cached = isHex(v) ? v : null;
  } catch (_e) {
    // No SecureStore, a locked keystore, a first launch: all the same answer.
    cached = null;
  }
  const chosen = chooseAccent({ cached });
  paint(chosen.accent);
  return chosen;
}

/**
 * Step 4: ask the server and remember the answer for the next launch.
 *
 * Deliberately does NOT repaint. By the time this resolves the screen tree has
 * been imported and 60 stylesheets are already baked; writing a new colour in
 * now would repaint exactly the 12 inline references and leave the rest — the
 * half-themed screen this whole design exists to prevent. The value is stored
 * and takes effect on the next start.
 *
 * Fire-and-forget by contract: it resolves to what it did, and never rejects.
 */
export async function refreshAccentForNextStart(api, store = SecureStore) {
  // fetchAccent and cacheAccent already exist, already swallow their own
  // failures and are already tested; this is the order they go in, not a second
  // implementation of either.
  const fetched = await fetchAccent(api);
  if (!isHex(fetched)) return { stored: false, accent: null, reason: 'absent' };
  const stored = await cacheAccent(store, fetched);
  return { stored, accent: fetched, reason: stored ? 'ok' : 'unwritable' };
}
