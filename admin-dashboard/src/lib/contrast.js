// WCAG contrast, for the live preview in Admin → Appearance.
//
// This is a SECOND COPY of backend/src/utils/theme.js's maths, and that is a
// deliberate, bounded duplication rather than an oversight. The panel has to
// tell an operator what a colour will read like WHILE THEY TYPE IT — before it
// is saved, and without a round trip per keystroke on an admin connection that
// is often the same 2G link the shops are on. The backend copy stays the
// authority: what it reports on GET is what the panel shows for the SAVED value.
//
// Two copies of a formula drift. So tests/contrast-agrees-with-backend.test.js
// checks this one against the same fixed points the backend test uses AND
// against the backend's own numbers for the colours that actually ship, which
// is what makes the drift detectable instead of silent.

/** '#RGB' / 'rgb' / '#RRGGBB' / 'RRGGBB' -> '#rrggbb', or null. */
export function normalizeHex(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(s)) return `#${s.toLowerCase().split('').map((c) => c + c).join('')}`;
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s.toLowerCase()}`;
  return null;
}

/** WCAG 2.1 relative luminance. */
export function luminance(hex) {
  const h = normalizeHex(hex);
  if (!h) return null;
  const chan = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
}

/** WCAG contrast ratio between two colours, 1..21. */
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// The two fixed colours the accent lands on in the apps. Not operator-settable:
// an operator who can repaint the text can make the screen unreadable from here
// with no way to see it. Kept in step with backend/src/utils/theme.js.
export const ON_ACCENT = '#052e16';
export const APP_BG = '#0f172a';

/** The same shape the backend returns, for a colour that has not been saved yet. */
export function contrastReport(accent) {
  const hex = normalizeHex(accent);
  if (!hex) return null;
  const onButton = contrastRatio(hex, ON_ACCENT);
  const asText = contrastRatio(hex, APP_BG);
  const round = (n) => Math.round(n * 100) / 100;
  return {
    accent: hex,
    on_accent: { against: ON_ACCENT, ratio: round(onButton), passes_aa: onButton >= 4.5 },
    on_app_bg: { against: APP_BG, ratio: round(asText), passes_aa: asText >= 4.5, passes_aa_large: asText >= 3 },
    warnings: [
      onButton < 4.5 && `Text on an accent-filled button would be ${round(onButton)}:1 — below the 4.5:1 that body text wants.`,
      asText < 3 && `The accent used as text or an icon on the app background would be ${round(asText)}:1 — below 3:1, hard to see on a cheap screen in daylight.`,
    ].filter(Boolean),
  };
}
