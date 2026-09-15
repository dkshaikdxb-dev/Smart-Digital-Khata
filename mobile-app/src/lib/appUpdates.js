// Over-the-air update status and a manual "check now", for both flavors.
//
// WHY THIS EXISTS. app.config.js sets `updates.fallbackToCacheTimeout: 0`, so
// the app ALWAYS launches on the bundle it already has and downloads a newer one
// in the background. That is the right choice — nobody should stare at a splash
// screen on 2G — but it has two consequences that look exactly like "updates are
// broken":
//
//   1. A published update needs a SECOND launch to appear. The launch that
//      downloads it still runs the old code.
//   2. On Android, "reopening" the app usually resumes the same process. The
//      process never restarted, so the downloaded bundle is never applied, and
//      a user can reopen the app all day and stay on last month's code.
//
// Neither is visible. Nothing on screen has ever said which bundle is running,
// so a perfectly healthy delivery chain and a completely broken one produce the
// same evidence: "it still looks old". This module is the evidence. It reports
// the running bundle's id, its age, whether it is the one built into the APK or
// a downloaded update, and the runtime/channel it belongs to — and it can fetch
// and apply a new one in a single tap, turning the two-launch wait into one.
//
// NEVER CRASHES. `expo-updates` is a native module: in Expo Go, in a dev client,
// and on any build where it is not linked, the import itself or the first
// property read throws. So it is loaded through the same guarded require the
// voice hook uses (see src/lib/useNativeVoice.js), every read is wrapped, and
// every API call is gated on `Updates.isEnabled`. With the module missing the
// whole surface degrades to `available: false` and the caller shows a plain
// "updates are turned off in this build" line instead of a dead button.
//
// NO NEW DEPENDENCY. expo-updates is already in package.json; this file adds
// nothing to it, which is what keeps the fix itself shippable over the air to
// the very users who are stuck on an old bundle.

let Updates = null;
try {
  // Throws at import time when the native module is not linked.
  Updates = require('expo-updates');
} catch (e) {
  Updates = null;
}

// Read a property off the native module without ever throwing. In Expo Go the
// getters themselves raise, so a plain `Updates.updateId` is not safe.
function safe(read, fallback = null) {
  try {
    const v = read();
    return v === undefined ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

// ---------------------------------------------------------------- pure bits

// A bundle id is a UUID; nobody reads 36 characters off a phone screen and
// matches it against a workflow log. Eight hex characters are enough to tell
// two publishes apart and short enough to read aloud down a phone line.
export function shortUpdateId(id) {
  const s = String(id == null ? '' : id).replace(/-/g, '').trim();
  if (!s) return '';
  return s.slice(0, 8).toLowerCase();
}

// How old the running bundle is, as { unit, n } so the caller picks the
// translated sentence. Coarse on purpose: the question being answered is "is
// this last week's code or this morning's", not "how many seconds".
// Returns null when the timestamp is missing or unparseable, which is itself
// honest — an embedded launch often has no createdAt worth showing.
export function updateAge(createdAt, now = Date.now()) {
  const t =
    createdAt instanceof Date ? createdAt.getTime() : Date.parse(String(createdAt || ''));
  if (!Number.isFinite(t)) return null;
  const minutes = Math.floor(Math.max(0, now - t) / 60000);
  if (minutes < 1) return { unit: 'now', n: 0 };
  if (minutes < 60) return { unit: 'minutes', n: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: 'hours', n: hours };
  return { unit: 'days', n: Math.floor(hours / 24) };
}

// ------------------------------------------------------------- live status

/**
 * What is running right now.
 *
 * `available` — the native module answered at all.
 * `enabled`   — expo-updates is switched on for this build. False in Expo Go and
 *               in a dev client, where check/fetch/reload all throw.
 * `embedded`  — TRUE means the bundle shipped inside the APK is running and this
 *               install has never applied an update. This is the single most
 *               important bit on the screen: it is the difference between "the
 *               update did not arrive" and "the update arrived and is fine".
 */
export function getUpdateStatus() {
  if (!Updates) {
    return {
      available: false, enabled: false, embedded: false,
      updateId: null, shortId: '', createdAt: null, runtimeVersion: null, channel: null,
    };
  }
  const updateId = safe(() => Updates.updateId);
  return {
    available: true,
    enabled: safe(() => Updates.isEnabled, false) === true,
    // isEmbeddedLaunch is the authoritative flag. When the module is too old to
    // expose it, fall back to "no updateId" — an update always has one.
    embedded: safe(() => Updates.isEmbeddedLaunch, updateId == null) === true,
    updateId: updateId || null,
    shortId: shortUpdateId(updateId),
    createdAt: safe(() => Updates.createdAt),
    runtimeVersion: safe(() => Updates.runtimeVersion),
    channel: safe(() => Updates.channel),
  };
}

/**
 * Check, fetch and apply in one tap.
 *
 * Resolves to one of four HONEST outcomes, never a thrown error:
 *   'disabled'  — expo-updates is off in this build (dev client / Expo Go).
 *   'uptodate'  — the server has nothing newer than what is running.
 *   'reloading' — a new bundle was downloaded and the app is restarting onto it.
 *   'failed'    — the check or the download did not finish (usually no network);
 *                 `error` carries the cause.
 *
 * `onReloading` is called immediately BEFORE reloadAsync() because that call
 * tears the JS context down and never resolves — anything said afterwards is
 * said to a screen that no longer exists.
 */
export async function checkAndApplyUpdate({ onReloading } = {}) {
  if (!Updates) return { outcome: 'disabled' };
  if (safe(() => Updates.isEnabled, false) !== true) return { outcome: 'disabled' };

  let found;
  try {
    found = await Updates.checkForUpdateAsync();
  } catch (e) {
    return { outcome: 'failed', error: e };
  }
  if (!found || !found.isAvailable) return { outcome: 'uptodate' };

  try {
    const fetched = await Updates.fetchUpdateAsync();
    // A manifest can be newer than ours and still resolve to the bundle we are
    // already running (a re-publish of the same commit). Saying "restarting"
    // and then not restarting would be the worse lie of the two.
    if (fetched && fetched.isNew === false) return { outcome: 'uptodate' };
  } catch (e) {
    return { outcome: 'failed', error: e };
  }

  try {
    if (typeof onReloading === 'function') onReloading();
    await Updates.reloadAsync();
  } catch (e) {
    return { outcome: 'failed', error: e };
  }
  // Practically unreachable: reloadAsync restarts the app.
  return { outcome: 'reloading' };
}

export default { getUpdateStatus, checkAndApplyUpdate, shortUpdateId, updateAge };
