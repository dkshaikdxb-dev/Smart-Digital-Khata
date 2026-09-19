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


// ---- deriving an accent family ---------------------------------------------
//
// ONE hex cannot paint every surface, and pretending otherwise is how the
// storefront's light theme came to be audited in the first place. The shipped
// green #22c55e is 2.28:1 on white — as a button it has barely an edge against
// the page — which is why the consumer web's light tokens use a deeper #15803d
// for the fill and #0f7233 again for accent TEXT, and why its dark tokens go
// the other way, to #2dd36a and #4ade80.
//
// Those hand-picked values are all the SAME HUE, at close to the same
// saturation, as the green they came from: only the lightness moved, until the
// colour cleared what it had to clear against the ground it sits on. So that is
// what this does, for whatever colour an operator picks — the result is
// recognisably their colour on every surface, rather than their colour on one
// surface and an illegible smear on the others.

/** '#rrggbb' -> {h: 0..360, s: 0..1, l: 0..1}. */
function toHsl(hex) {
  const h6 = normalizeHex(hex);
  if (!h6) return null;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h6.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

/** {h, s, l} -> '#rrggbb'. */
function fromHsl({ h, s, l }) {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = Math.floor(hh / 60) % 6;
  const rgb = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][seg];
  return `#${rgb.map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The shade of this colour NEAREST the one given that satisfies `shortfall`.
 *
 * `shortfall(hex)` returns 0 when a shade is acceptable and a positive number
 * for how far short it falls. Hue and saturation are held and only lightness is
 * scanned, in 1% steps, so the answer is the operator's colour at a different
 * brightness — never a different colour.
 *
 * Minimal movement is the rule: of every acceptable shade, the one closest to
 * the original lightness wins. When NONE is acceptable — a demand the hue
 * cannot meet on that ground — the least-bad shade is returned rather than
 * null. A slightly dim button is a worse button; no colour at all is a broken
 * screen, and the operator is shown the number either way.
 */
function nearestShade(accent, shortfall) {
  const hsl = toHsl(accent);
  if (!hsl) return null;
  let ok = null;
  let fallback = null;
  for (let i = 0; i <= 100; i += 1) {
    const hex = fromHsl({ h: hsl.h, s: hsl.s, l: i / 100 });
    const miss = shortfall(hex);
    if (miss <= 0) {
      const dist = Math.abs(i / 100 - hsl.l);
      if (!ok || dist < ok.dist) ok = { hex, dist };
    } else if (!fallback || miss < fallback.miss) {
      fallback = { hex, miss };
    }
  }
  return ok ? ok.hex : (fallback && fallback.hex);
}

/** Whichever of two inks reads better ON this colour. */
function inkOn(accent, dark, light) {
  return contrastRatio(accent, dark) >= contrastRatio(accent, light) ? dark : light;
}

// The grounds each web theme actually paints on, lifted from the stylesheet
// that defines them (admin-dashboard/src/styles/globals.css). They are NOT
// operator-settable, which is the only reason a derived colour can be checked
// here rather than hoped about.
const WEB_LIGHT = { bg: '#f6f8fa', surface: '#ffffff', soft_l: 0.93, border_l: 0.82 };
const WEB_DARK = { bg: '#0f172a', surface: '#1e293b', soft_l: 0.15, border_l: 0.30 };

// The two inks a fill can carry. Same pair the apps use.
const DARK_INK = '#04220f';
const LIGHT_INK = '#ffffff';

/**
 * One accent -> the five tokens a web theme needs.
 *
 *   accent       the CTA fill, with on_accent as the label drawn on it
 *   ink          the accent used as TEXT, on that theme's page background
 *   soft         a tinted panel, so a banner is never flooded with raw accent
 *   soft_border  its hairline
 *
 * THE FILL CARRIES TWO CONSTRAINTS, not one. Its label must clear 4.5:1 — the
 * obvious one — and the fill itself must clear 3:1 against the surface behind
 * it, because a button nobody can find is as broken as one nobody can read.
 * That second constraint is exactly what pushes a bright green down to a deep
 * one on a white page, and it is the one that is easy to forget.
 *
 * soft and soft_border are not blends with the ground: mixing a bright green
 * into navy gives a muddy teal. They are the accent's own hue, a little
 * desaturated, at a fixed lightness per theme — which is what the shipped
 * palette turns out to be.
 */
function webTokens(accent, ground) {
  const hex = normalizeHex(accent);
  if (!hex) return null;
  const hsl = toHsl(hex);

  const fill = nearestShade(hex, (cand) => {
    const label = Math.max(contrastRatio(cand, DARK_INK), contrastRatio(cand, LIGHT_INK));
    const edge = contrastRatio(cand, ground.surface);
    return Math.max(4.5 - label, 3 - edge, 0);
  });
  const ink = nearestShade(hex, (cand) => Math.max(4.5 - contrastRatio(cand, ground.bg), 0));

  const tint = (l, satScale) => fromHsl({ h: hsl.h, s: hsl.s * satScale, l });
  return {
    accent: fill,
    on_accent: inkOn(fill, DARK_INK, LIGHT_INK),
    ink,
    soft: tint(ground.soft_l, 0.6),
    soft_border: tint(ground.border_l, 0.7),
  };
}

/**
 * The whole family: what the dark app chrome uses, and what each web theme does.
 *
 * `app` is the RAW colour. The two mobile apps and the shopkeeper's web console
 * all draw it on the same navy #0f172a it was chosen against, so nothing needs
 * deriving there beyond which ink sits on top of it.
 */
function accentFamily(accent) {
  const hex = normalizeHex(accent);
  if (!hex) return null;
  return {
    app: { accent: hex, on_accent: inkOn(hex, ON_ACCENT, LIGHT_INK) },
    light: webTokens(hex, WEB_LIGHT),
    dark: webTokens(hex, WEB_DARK),
  };
}

module.exports = {
  DEFAULT_ACCENT, ON_ACCENT, APP_BG, WEB_LIGHT, WEB_DARK, DARK_INK, LIGHT_INK,
  normalizeHex, luminance, contrastRatio, contrastReport,
  toHsl, fromHsl, nearestShade, inkOn, webTokens, accentFamily,
};
