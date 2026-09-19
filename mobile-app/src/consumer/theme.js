// Warm, high-contrast, large-tap-target theme for the consumer app. Reuses the
// app's khata-green accent (#22c55e / #1C7A45) on a dark base (#0f172a) that
// matches the owner flavor, so both apps feel like one family.
//
// THE ACCENT IS MUTABLE, AND THE OBJECT IDENTITY IS THE MECHANISM. Every screen
// reads `colors.accent` as a property at the moment its StyleSheet.create runs
// — 56 of the 68 references the platform colour reaches are inside one,
// evaluated when the module is imported. So the platform accent is applied by
// writing into THIS object before the screen tree is imported (see
// src/bootAccent.js), and after that every sheet, inline style and runtime read
// sees the same value.
//
// 9 further references use `colors.positive` and are never repainted: 77 in the
// accent family altogether.
//
// Two rules follow from that, and both are checked by
// scripts/mobile-theme-boot.test.mjs:
//   - no file may destructure (`const { accent } = colors`), because that
//     copies the value and freezes it at whatever it was;
//   - no file may write the accent hex literally, because a literal cannot be
//     repainted and the screen would be half-themed.
import { onAccentFor, accentDarkFor } from '../lib/accentDerive';

export const colors = {
  bg: '#0f172a',
  card: '#1e293b',
  cardAlt: '#0b1220',
  border: '#334155',
  text: '#f1f5f9',
  textMuted: '#94a3b8',
  accent: '#22c55e',
  accentDark: '#1C7A45',
  onAccent: '#052e16',
  danger: '#ef4444',
  warn: '#f59e0b',
  // NOT the accent, and deliberately not repainted with it. `positive` is the
  // green that carries a MEANING and is read against `danger` in the same
  // glance: an advance where a debt is red, a payment where a purchase is red, a
  // money figure the app draws in green, a note whose tone is 'ok'. A festive
  // orange must not be able to make "paid" and "overdue" the same colour family.
  //
  // Same name and same role as `positive` in src/theme.js, so the two flavors
  // read alike. It replaces the `ok` token that sat here unused since the theme
  // was written — this is the job it was added for, finally done.
  positive: '#22c55e',
};

// The colour this app ships with, and the floor under every failure path.
// Matches lib/accent.js DEFAULT_ACCENT and the server's.
export const DEFAULT_ACCENT = colors.accent;

// The exact trio the app shipped with, kept so the default can be restored
// literally rather than re-derived. accentDarkFor(#22c55e) lands on #197747 —
// three points per channel from the hand-picked #1C7A45, which is close enough
// to be evidence the derivation is the right rule and far enough to be a
// colour change nobody asked for. A platform that never set an accent must
// look exactly as it did yesterday.
const SHIPPED = { accent: colors.accent, accentDark: colors.accentDark, onAccent: colors.onAccent };

/**
 * Repaint the accent family in place.
 *
 * Called ONCE, from the boot gate, before any screen module is imported. A
 * value that is not a plain '#rrggbb' is ignored rather than repaired — the
 * server normalises before it sends, so anything else means something upstream
 * is wrong and guessing would paint a colour nobody chose.
 *
 * Returns the accent now in effect, so the caller can say what it did.
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

// Shared sizing tokens — deliberately generous for low-literacy, older, and
// low-vision users (min 48px tap targets, large legible type).
export const sizes = {
  tap: 52,
  radius: 14,
  gap: 12,
  pad: 16,
  title: 22,
  body: 16,
  big: 30,
};
