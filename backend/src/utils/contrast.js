// WCAG contrast, and the colour parsing around it.
//
// PURE — no database, no config, nothing to mock. It sits apart from theme.js
// for two reasons: the maths has no business depending on a connection pool,
// and the dashboard's own copy (admin-dashboard/src/lib/contrast.js) is tested
// against THIS file, which a module that drags `pg` in could not be loaded from
// a jsdom test to do.

// The colour every client hardcodes today, and the floor everything falls back
// to, so a failure can never blank the accent out.
const DEFAULT_ACCENT = '#22c55e';

// The two fixed colours the accent has to work against in the apps. They are
// NOT operator-settable — see migration 0076 for why — so contrast can be
// judged here rather than guessed at.
const ON_ACCENT = '#052e16';   // text drawn ON an accent-filled button
const APP_BG = '#0f172a';      // the ground the accent is drawn on as text or an icon

/** '#RGB' / 'rgb' / '#RRGGBB' / 'RRGGBB' -> '#rrggbb', or null if it is not a colour. */
function normalizeHex(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(s)) return `#${s.toLowerCase().split('').map((c) => c + c).join('')}`;
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s.toLowerCase()}`;
  return null;
}

/** WCAG 2.1 relative luminance. */
function luminance(hex) {
  const h = normalizeHex(hex);
  if (!h) return null;
  const chan = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
}

/** WCAG contrast ratio between two colours, 1..21. */
function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * How a candidate accent behaves in the two places the apps put it.
 *
 * Reported, never enforced: the operator is told the number and decides. A
 * brand colour that fails is still theirs to choose; a colour that fails
 * silently is not something this should allow.
 */
function contrastReport(accent) {
  const hex = normalizeHex(accent);
  if (!hex) return null;
  const onButton = contrastRatio(hex, ON_ACCENT);
  const asText = contrastRatio(hex, APP_BG);
  const round = (n) => Math.round(n * 100) / 100;
  return {
    accent: hex,
    // Button label on an accent fill. Body-sized text wants 4.5:1.
    on_accent: { against: ON_ACCENT, ratio: round(onButton), passes_aa: onButton >= 4.5 },
    // The accent used as text or an icon on the app's dark ground.
    on_app_bg: { against: APP_BG, ratio: round(asText), passes_aa: asText >= 4.5, passes_aa_large: asText >= 3 },
    warnings: [
      onButton < 4.5 && `Text on an accent-filled button would be ${round(onButton)}:1 — below the 4.5:1 that body text wants.`,
      asText < 3 && `The accent used as text or an icon on the app background would be ${round(asText)}:1 — below 3:1, hard to see on a cheap screen in daylight.`,
    ].filter(Boolean),
  };
}

module.exports = {
  DEFAULT_ACCENT, ON_ACCENT, APP_BG,
  normalizeHex, luminance, contrastRatio, contrastReport,
};
