// The owner app's accent, and only its accent.
//
// This is NOT a palette. The shopkeeper app has no theme module and its
// navy/slate/red values are written where they are used; pulling all of them in
// here would be a large rewrite of screens that are working, for no benefit to
// the one thing that now changes. So this holds the accent family and nothing
// else, and every other colour in those screens is left exactly where it was.
//
// It mirrors src/consumer/theme.js on purpose — same key names, same mutation
// mechanism, same rules — so the two flavors are read the same way:
//
//   the accent is applied by WRITING INTO THIS OBJECT before the screen tree is
//   imported (src/bootAccent.js), because a screen's StyleSheet.create runs at
//   import and reads `colors.accent` as a property at that moment.
//
// Which means, and scripts/mobile-theme-boot.test.mjs enforces both:
//   - no destructuring (`const { accent } = colors`) — that copies and freezes;
//   - no accent hex written literally in a screen — a literal cannot be
//     repainted, and one left behind is a half-themed screen.
import { onAccentFor, accentDarkFor } from './lib/accentDerive';

export const colors = {
  // Brand. Buttons, active chips and pills, spinners, switch tracks, the tab
  // bar's active tint, link-styled actions. This is what a festive window
  // repaints.
  accent: '#22c55e',
  accentDark: '#1C7A45',
  onAccent: '#052e16',

  // NOT brand, and deliberately fixed. `positive` is the green that carries a
  // MEANING and is read against red in the same glance:
  //   - a payment shown green where a purchase is shown red
  //   - an order that is completed
  //   - a shop that is open
  // The consumer app already draws its status badges from a fixed green for
  // this reason. If a Diwali orange repainted these, a shopkeeper would be
  // reading "paid" and "owed" in colours that no longer contrast, which is a
  // worse outcome than a festival the owner app joins only partly.
  positive: '#22c55e',
};

// The colour this app ships with, and the floor under every failure path.
export const DEFAULT_ACCENT = colors.accent;

// The exact trio shipped, restored literally for the default rather than
// re-derived — see the same note in src/consumer/theme.js. A platform that
// never set an accent must look exactly as it did yesterday.
const SHIPPED = { accent: colors.accent, accentDark: colors.accentDark, onAccent: colors.onAccent };

/**
 * Repaint the accent family in place. Called once, from the boot gate.
 *
 * A value that is not a plain '#rrggbb' is ignored rather than repaired, and
 * `positive` is never touched. Returns the accent now in effect.
 */
export function applyAccent(hex) {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/.test(hex)) return colors.accent;
  if (hex === DEFAULT_ACCENT) {
    Object.assign(colors, SHIPPED);
    return colors.accent;
  }
  colors.accent = hex;
  colors.accentDark = accentDarkFor(hex);
  colors.onAccent = onAccentFor(hex);
  return colors.accent;
}
