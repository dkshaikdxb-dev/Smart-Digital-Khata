// The two colours an accent needs beside itself, worked out on the device.
//
// The server sends ONE hex, already resolved against any festive window and
// already normalised (backend/src/utils/theme.js). Two more are needed to paint
// with it: the ink that sits ON the accent, and the darker shade used for
// borders, switch tracks and pressed states.
//
// WHY THESE ARE DERIVED HERE RATHER THAN SENT. The app's cold-start path reads
// ONE cached hex out of SecureStore — that is the cache's shape, it is tested,
// and widening it would mean an app that had cached the old shape boots with no
// accent at all. So the derivation has to exist on the device for the offline
// case regardless, and having it in two places when one of them cannot be used
// is worse than having it in one.
//
// It IS a second copy of a rule the backend also holds, and that is checked
// rather than hoped for: scripts/mobile-theme-boot.test.mjs loads
// backend/src/utils/contrast.js and asserts onAccentFor() picks the same ink as
// its inkOn() for every colour this product is likely to see.
//
// No imports, on purpose — that is what lets the vm test harness load it.

// The ink drawn on an accent-filled surface, and the app's dark ground. Both
// fixed in the clients, which is what makes a choice between them checkable.
export const DARK_INK = '#052e16';
export const LIGHT_INK = '#ffffff';
export const APP_BG = '#0f172a';

/** '#rrggbb' -> [r, g, b], or null if it is not that shape. */
export function channels(hex) {
  if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

/** WCAG 2.1 relative luminance. Same formula the server uses. */
export function luminance(hex) {
  const ch = channels(hex);
  if (!ch) return null;
  const lin = ch.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG contrast ratio, 1..21. */
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  return la >= lb ? (la + 0.05) / (lb + 0.05) : (lb + 0.05) / (la + 0.05);
}

/**
 * Which ink reads on this accent — the near-black green, or white.
 *
 * A button label is the one thing on the screen that must never be a judgement
 * call: whichever of the two has more contrast wins, and there is no third
 * option to get wrong.
 */
export function onAccentFor(accent) {
  if (!channels(accent)) return DARK_INK;
  return contrastRatio(accent, DARK_INK) >= contrastRatio(accent, LIGHT_INK) ? DARK_INK : LIGHT_INK;
}

/**
 * The darker shade: the accent blended toward the app's own background.
 *
 * Blending toward the ground rather than dimming the colour is what keeps a
 * border or a switch track looking like it belongs to the surface it is drawn
 * on. At 0.55 this reproduces the hand-picked #1C7A45 from the shipped green to
 * within three points per channel, which is the evidence that 0.55 is the
 * number the original choice was already using.
 */
export function accentDarkFor(accent, ground = APP_BG, weight = 0.55) {
  const a = channels(accent);
  const g = channels(ground);
  if (!a || !g) return accent;
  const hex = a.map((v, i) => Math.round(g[i] + (v - g[i]) * weight).toString(16).padStart(2, '0'));
  return `#${hex.join('')}`;
}
