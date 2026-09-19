// The platform accent, as the app sees it.
//
// The colour is decided on the server (see backend/src/utils/theme.js): one
// value, already resolved against any festive window, already normalised. The
// app's job is only to fetch it, keep the last good one, and never let either
// of those fail into a screen with no accent.
//
// So there is no date logic here and no schedule, deliberately. A phone whose
// clock is wrong — which on a cheap Android with no SIM is not rare — cannot
// pick the wrong theme, because it is not the one choosing.
//
// The pure half of this file (isHex, chooseAccent) has no imports and is what
// scripts/mobile-consumer-logic.test.mjs exercises; the I/O half is kept thin
// on purpose, because nothing here can test it.

// The colour this app ships with, and the floor under everything below. Kept in
// step with backend/src/utils/contrast.js DEFAULT_ACCENT and with theme.js.
export const DEFAULT_ACCENT = '#22c55e';

// Where the last good accent is kept between launches. A separate key from the
// owner app's, like every other consumer store in this app.
export const ACCENT_KEY = 'consumer_theme_accent';

/**
 * Is this the shape the server promises?
 *
 * Deliberately NOT a parser. The server normalises before it sends, so anything
 * that is not already '#rrggbb' is a value this app should not have received
 * and should not try to rescue — guessing at a malformed colour is how you end
 * up painting something nobody chose.
 */
export function isHex(v) {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/.test(v);
}

/**
 * Which accent to paint, given what the network said and what was cached.
 *
 * The order is the point:
 *   a fresh value from the server  ->  use it, and it becomes the cache
 *   nothing fresh, something cached ->  the cache, so an offline start still
 *                                       looks like the last online one
 *   neither                         ->  the shipped colour
 *
 * A malformed value at either step is treated as absent rather than obeyed.
 */
export function chooseAccent({ fetched, cached } = {}) {
  if (isHex(fetched)) return { accent: fetched, from: 'server' };
  if (isHex(cached)) return { accent: cached, from: 'cache' };
  return { accent: DEFAULT_ACCENT, from: 'default' };
}

/** The accent inside a /public/config body, or null if it is not there. */
export function accentFromConfig(body) {
  const v = body && body.theme && body.theme.accent;
  return isHex(v) ? v : null;
}

// ---- I/O ------------------------------------------------------------------
// Everything below touches the device or the network. Each swallows its own
// failure and reports "nothing", because there is no error here worth showing a
// shopper: the app has a colour either way.

export async function readCachedAccent(SecureStore) {
  try {
    const v = await SecureStore.getItemAsync(ACCENT_KEY);
    return isHex(v) ? v : null;
  } catch (_e) {
    return null;
  }
}

export async function cacheAccent(SecureStore, hex) {
  if (!isHex(hex)) return false;
  try {
    await SecureStore.setItemAsync(ACCENT_KEY, hex);
    return true;
  } catch (_e) {
    return false;
  }
}

/**
 * Ask the server. Short timeout on purpose: this is decoration, and a shopper
 * on 2G must never wait on it — the caller already has a colour to paint.
 */
export async function fetchAccent(api, { timeout = 4000 } = {}) {
  try {
    const res = await api.get('/public/config', { timeout });
    return accentFromConfig(res && res.data);
  } catch (_e) {
    return null;
  }
}
