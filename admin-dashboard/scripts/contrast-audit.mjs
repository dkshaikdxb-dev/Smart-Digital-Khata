#!/usr/bin/env node
/**
 * Contrast audit for the owner console + consumer PWA palettes.
 *
 * Run:  npm run audit:contrast      (from admin-dashboard/)
 *
 * Nothing here hard-codes the CURRENT palette. The --* and --c-* token blocks are
 * parsed out of src/styles/globals.css, so the AFTER column is always whatever the
 * stylesheet actually ships; change a token and the numbers move. The BEFORE
 * column is a frozen snapshot of the palette as it stood before batch THEME2,
 * recorded below so the improvement stays legible, and every one of those numbers
 * is computed by the same code path rather than copied from a report.
 *
 * Translucent fills (the status-pill tints, the danger panel) are composited over
 * their real backdrop before the ratio is taken, because a pill's "background" is
 * not what you see -- the card underneath shows through it.
 *
 * WCAG 2.1: 4.5:1 for body text, 3:1 for large text and for non-text UI
 * boundaries such as a field outline. Exits non-zero if a pairing regresses.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CSS_PATH = process.argv[2] || path.join(HERE, '..', 'src', 'styles', 'globals.css');

/* ------------------------------------------------------------ colour maths */
const toLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
const contrast = (fg, bg) => {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

const RGBA = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/;

function parseColor(spec) {
  const s = String(spec).trim();
  const m = RGBA.exec(s);
  if (m) {
    return {
      rgb: [m[1], m[2], m[3]].map((n) => Math.round(Number(n))),
      alpha: m[4] === undefined ? 1 : Number(m[4]),
    };
  }
  let h = s.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return {
    rgb: [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)),
    alpha: 1,
  };
}

/** source-over a possibly translucent colour onto an opaque backdrop */
function composite(spec, backdrop) {
  const { rgb, alpha } = parseColor(spec);
  if (alpha >= 1) return rgb;
  return rgb.map((c, i) => Math.round(alpha * c + (1 - alpha) * backdrop[i]));
}

/* ------------------------------------------- parse the live token blocks */
function loadBlocks(cssPath) {
  const raw = fs.readFileSync(cssPath, 'utf8');
  // strip comments first: a colour quoted in prose is not a token
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '');
  const find = (selectorTest) => {
    for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!selectorTest(m[1].trim())) continue;
      const out = {};
      for (const d of m[2].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/g)) out[d[1]] = d[2].trim();
      if (Object.keys(out).length) return out;
    }
    throw new Error(`no token block matched in ${cssPath}`);
  };
  return {
    raw,
    css: src, // comments stripped: the guards below must read declarations, not prose
    owner: find((s) => s === ':root'),
    light: find((s) => s === '.cpwa'),
    dark: find((s) => s === ':root[data-theme="dark"] .cpwa'),
  };
}

/* The palette as it stood BEFORE batch THEME2, so the improvement is measurable.
   Frozen on purpose: this is a baseline, not a second source of truth. */
const BASELINE = {
  owner: {
    '--bg': '#0f172a', '--card': '#1e293b', '--text': '#e2e8f0', '--muted': '#94a3b8',
    '--accent': '#22c55e', '--danger': '#ef4444',
    // --success, --on-*, --border, --border-strong, --warn* did not exist; every
    // call site silently took its inline fallback instead. Those fallbacks are
    // written as literals in the pairings below.
  },
  light: {
    '--c-bg': '#f6f8fa', '--c-surface': '#ffffff', '--c-surface-2': '#f1f5f9',
    '--c-border': '#e6ebf1', '--c-border-strong': '#cbd5e1',
    '--c-text': '#0f172a', '--c-muted': '#5c6a7a', '--c-accent': '#15803d',
    '--c-on-accent': '#ffffff', '--c-accent-ink': '#0f7233',
    '--c-accent-soft': '#e6f4ec', '--c-accent-soft-border': '#bfe3ce',
    '--c-danger': '#dc2626', '--c-danger-bg': '#fef2f2',
  },
  dark: {
    '--c-bg': '#0f172a', '--c-surface': '#1e293b', '--c-surface-2': '#0b1220',
    '--c-border': '#2b3a52', '--c-border-strong': '#415167',
    '--c-text': '#f1f5f9', '--c-muted': '#9fb0c3', '--c-accent': '#2dd36a',
    '--c-on-accent': '#04220f', '--c-accent-ink': '#4ade80',
    '--c-accent-soft': '#16351f', '--c-accent-soft-border': '#2c6b3f',
    '--c-danger': '#ef4444', '--c-danger-bg': 'rgba(239,68,68,.12)',
  },
};

const AFTER = loadBlocks(CSS_PATH);

/** a spec is either a literal colour, or "block:token" resolved in that palette */
function resolve(palette, spec) {
  if (/^(#|rgb)/.test(spec)) return spec;
  const [blk, token] = spec.split(':');
  const value = palette[blk]?.[`--${token}`];
  if (value === undefined) throw new Error(`${blk} has no --${token}`);
  if (value.includes('var(')) throw new Error(`--${token} is still a var(): ${value}`);
  return value;
}

function measure(palette, [fg, bg, backdropSpec]) {
  const backdrop = backdropSpec ? parseColor(resolve(palette, backdropSpec)).rgb : null;
  const bgRgb = backdrop ? composite(resolve(palette, bg), backdrop) : parseColor(resolve(palette, bg)).rgb;
  const fgRgb = composite(resolve(palette, fg), bgRgb);
  const hex = (c) => '#' + c.map((n) => n.toString(16).padStart(2, '0')).join('');
  return { ratio: contrast(fgRgb, bgRgb), shown: `${hex(fgRgb)} on ${hex(bgRgb)}` };
}

/* ---------------------------------------------------------- the pairings */
// kind: 'text' needs `need`; 'ui' needs `need` (3:1 boundaries); 'divider' wants
// to land inside a band -- a divider must be visible without reading as a rule.
const DIVIDER_BAND = [1.3, 4.5];
const P = [];
const check = (id, what, theme, before, after, need, opts = {}) =>
  P.push({ id, what, theme, before, after, need, ...opts });

/* B1 -- three owner rules leaked into the consumer app, which never overrode them */
check('B1.1', 'card-anchor text: shop name, product price, order subtotal', 'light',
  ['owner:accent', 'light:c-surface'], ['light:c-text', 'light:c-surface'], 4.5);
check('B1.1', 'card-anchor text: shop name, product price, order subtotal', 'dark',
  ['owner:accent', 'dark:c-surface'], ['dark:c-text', 'dark:c-surface'], 4.5);
check('B1.2', '.muted on card (incl. cart + order-item unit PRICES)', 'light',
  ['owner:muted', 'light:c-surface'], ['light:c-muted', 'light:c-surface'], 4.5);
check('B1.2', '.muted on page', 'light',
  ['owner:muted', 'light:c-bg'], ['light:c-muted', 'light:c-bg'], 4.5);
check('B1.2', '.muted on card', 'dark',
  ['owner:muted', 'dark:c-surface'], ['dark:c-muted', 'dark:c-surface'], 4.5);
check('B1.3', 'neutral .badge text -- the UNPAID payment pill', 'light',
  ['light:c-text', '#334155'], ['light:c-text', 'light:c-surface-2'], 4.5);
check('B1.3', 'neutral .badge text -- the UNPAID payment pill', 'dark',
  ['dark:c-text', '#334155'], ['dark:c-text', 'dark:c-surface-2'], 4.5);

/* B2 -- the customer's own balance reached into the owner palette */
check('B2', 'khata outstanding total, OWING (28px)', 'light',
  ['owner:danger', 'light:c-surface'], ['light:c-danger-ink', 'light:c-surface'], 4.5);
check('B2', 'khata outstanding total, OWING (28px)', 'dark',
  ['owner:danger', 'dark:c-surface'], ['dark:c-danger-ink', 'dark:c-surface'], 4.5);
check('B2', 'khata total SETTLED, and the advance line', 'light',
  ['owner:accent', 'light:c-surface'], ['light:c-accent-ink', 'light:c-surface'], 4.5);
check('B2', 'khata total SETTLED, and the advance line', 'dark',
  ['owner:accent', 'dark:c-surface'], ['dark:c-accent-ink', 'dark:c-surface'], 4.5);

/* B3 -- status pills, tints composited over the card they sit on */
check('B3', 'in-progress pill: Pending/Preparing/Ready/Out for delivery', 'light',
  ['#a16207', 'rgba(234,179,8,0.2)', 'light:c-surface'],
  ['light:c-warn-ink', 'light:c-warn-bg', 'light:c-surface'], 4.5);
check('B3', 'in-progress pill: Pending/Preparing/Ready/Out for delivery', 'dark',
  ['#eab308', 'rgba(234,179,8,0.2)', 'dark:c-surface'],
  ['dark:c-warn-ink', 'dark:c-warn-bg', 'dark:c-surface'], 4.5);
check('B3', 'cancelled pill', 'light',
  ['light:c-danger', 'rgba(239,68,68,0.2)', 'light:c-surface'],
  ['light:c-danger-ink', 'light:c-danger-bg', 'light:c-surface'], 4.5);
check('B3', 'cancelled pill', 'dark',
  ['dark:c-danger', 'rgba(239,68,68,0.2)', 'dark:c-surface'],
  ['dark:c-danger-ink', 'dark:c-danger-bg', 'dark:c-surface'], 4.5);
check('B3', 'completed pill (already passing; resized with the others)', 'light',
  ['light:c-accent-ink', 'light:c-accent-soft'], ['light:c-accent-ink', 'light:c-accent-soft'], 4.5);
check('B3', 'completed pill (already passing; resized with the others)', 'dark',
  ['dark:c-accent-ink', 'dark:c-accent-soft'], ['dark:c-accent-ink', 'dark:c-accent-soft'], 4.5);

/* B4 -- danger */
check('B4', '.cpwa-btn-danger label (was a hard-coded #fff)', 'light',
  ['#ffffff', 'light:c-danger'], ['light:c-on-danger', 'light:c-danger'], 4.5);
check('B4', '.cpwa-btn-danger label (was a hard-coded #fff)', 'dark',
  ['#ffffff', 'dark:c-danger'], ['dark:c-on-danger', 'dark:c-danger'], 4.5);
check('B4', 'consumer error text .cpwa-error, on card', 'dark',
  ['dark:c-danger', 'dark:c-surface'], ['dark:c-danger-ink', 'dark:c-surface'], 4.5);
check('B4', 'consumer error text .cpwa-error, on page', 'light',
  ['light:c-danger', 'light:c-bg'], ['light:c-danger-ink', 'light:c-bg'], 4.5);
check('B4', 'OWNER --danger on --card: the OWED balance figure,', 'owner',
  ['owner:danger', 'owner:card'], ['owner:danger', 'owner:card'], 4.5);
check('B4', '   statement debits, destructive warning (122 sites)', 'owner',
  ['owner:danger', 'owner:bg'], ['owner:danger', 'owner:bg'], 4.5);
check('B4', 'owner balance ADVANCE, for comparison (unchanged)', 'owner',
  ['owner:accent', 'owner:card'], ['owner:accent', 'owner:card'], 4.5);
check('B4', 'owner danger FILL label: suspend/block pills + buttons', 'owner',
  ['#ffffff', 'owner:danger'], ['owner:on-danger', 'owner:danger'], 4.5);
check('B4', 'owner --danger FILL vs the card it sits on', 'owner',
  ['owner:danger', 'owner:card'], ['owner:danger', 'owner:card'], 3.0, { kind: 'ui' });

/* B5 -- tokens referenced but never defined, so the inline fallback always won */
check('B5', 'shop OPEN pill label (was #fff on the #16a34a fallback)', 'owner',
  ['#ffffff', '#16a34a'], ['owner:on-success', 'owner:success'], 4.5);
check('B5', 'shop CLOSED pill label (was #fff on the #dc2626 fallback)', 'owner',
  ['#ffffff', '#dc2626'], ['owner:on-danger', 'owner:danger'], 4.5);
check('B5', 'platform-admin warn panel text (--warn-bg was undefined)', 'owner',
  ['owner:text', '#fffbe6'], ['owner:warn-ink', 'owner:warn-bg'], 4.5);
check('B5', 'divider hairline on the dark card: was the #eee fallback', 'owner',
  ['#eee', 'owner:card'], ['owner:border', 'owner:card'], null,
  { kind: 'divider', note: 'wants the DIVIDER band, not 3:1 -- visible, but not a glaring white rule' });
check('B5', 'divider hairline on the dark card: was the #e5e7eb fallback', 'owner',
  ['#e5e7eb', 'owner:card'], ['owner:border', 'owner:card'], null, { kind: 'divider' });

/* B6 -- the owner order stepper's CURRENT stage */
check('B6', 'order stepper CURRENT stage label, 13px bold', 'owner',
  ['#ffffff', 'owner:accent'], ['owner:on-accent', 'owner:accent'], 4.5);

/* B8 -- card and field boundaries */
check('B8', 'INPUT outline vs its own fill   <- the priority', 'light',
  ['light:c-border-strong', 'light:c-surface-2'], ['light:c-field-border', 'light:c-surface-2'], 3.0, { kind: 'ui' });
check('B8', 'INPUT outline vs the card behind it', 'light',
  ['light:c-border-strong', 'light:c-surface'], ['light:c-field-border', 'light:c-surface'], 3.0, { kind: 'ui' });
check('B8', 'INPUT outline vs its own fill   <- the priority', 'dark',
  ['dark:c-border-strong', 'dark:c-surface-2'], ['dark:c-field-border', 'dark:c-surface-2'], 3.0, { kind: 'ui' });
check('B8', 'INPUT outline vs the card behind it', 'dark',
  ['dark:c-border-strong', 'dark:c-surface'], ['dark:c-field-border', 'dark:c-surface'], 3.0, { kind: 'ui' });
check('B8', 'owner INPUT outline vs its own fill #0b1220', 'owner',
  ['#334155', '#0b1220'], ['owner:border-strong', '#0b1220'], 3.0, { kind: 'ui' });
check('B8', 'owner INPUT outline vs the card behind it', 'owner',
  ['#334155', 'owner:card'], ['owner:border-strong', 'owner:card'], 3.0, { kind: 'ui' });
check('B8', 'CARD boundary vs page', 'light',
  ['light:c-surface', 'light:c-bg'], ['light:c-border-strong', 'light:c-bg'], 3.0,
  { kind: 'ui', open: true, note: 'fill step alone before, a hairline now. 3:1 needs a mid-grey ring on every card -- a brand decision, not a token fix.' });
check('B8', 'CARD boundary vs page', 'dark',
  ['dark:c-surface', 'dark:c-bg'], ['dark:c-border-strong', 'dark:c-bg'], 3.0,
  { kind: 'ui', open: true, note: 'dark sets --c-shadow:none, so the fill step was the ONLY cue' });
check('B8', 'owner CARD boundary vs page', 'owner',
  ['owner:card', 'owner:bg'], ['owner:border', 'owner:bg'], 3.0, { kind: 'ui', open: true });

/* --------------------------------------------------------------- report */
const W = [6, 55, 6, 8, 8, 7, 9];
const pad = (s, w, right = false) => (right ? String(s).padStart(w) : String(s).padEnd(w));
const header = ['ID', 'PAIRING', 'THEME', 'BEFORE', 'AFTER', 'TARGET', 'RESULT']
  .map((h, i) => pad(h, W[i])).join('  ');
console.log(`contrast audit of ${path.relative(process.cwd(), CSS_PATH)}\n`);
console.log(header + '   RESOLVED');
console.log('-'.repeat(header.length + 26));

let regressions = 0;
let open = 0;
for (const row of P) {
  const before = measure(BASELINE, row.before).ratio;
  const { ratio: after, shown } = measure(AFTER, row.after);
  let ok;
  let target;
  if (row.kind === 'divider') {
    ok = after >= DIVIDER_BAND[0] && after <= DIVIDER_BAND[1];
    target = `${DIVIDER_BAND[0]}-${DIVIDER_BAND[1]}`;
  } else {
    ok = after + 1e-9 >= row.need;
    target = row.need.toFixed(1);
  }
  let verdict = ok ? 'PASS' : 'FAIL';
  if (!ok && row.open) { verdict = 'OPEN'; open += 1; } else if (!ok) { regressions += 1; }
  console.log([
    pad(row.id, W[0]), pad(row.what.slice(0, W[1]), W[1]), pad(row.theme, W[2]),
    pad(before.toFixed(2), W[3], true), pad(after.toFixed(2), W[4], true),
    pad(target, W[5], true), pad(verdict, W[6]),
  ].join('  ') + '   ' + shown);
}

console.log('');
for (const row of P.filter((r) => r.note)) console.log(`note  ${pad(row.id, 5)} ${pad(row.theme, 6)} ${row.note}`);
console.log('');
console.log(`${P.length} pairings recomputed. ${regressions} failing, ${open} open by design (see notes).`);

// Structural guards that belong with the palette rather than in a separate test.
const guards = [
  ['no withdrawn warm theme block remains', !AFTER.css.includes('data-theme="warm"')],
  ['system text scaling is not pinned off', !AFTER.css.includes('-webkit-text-size-adjust')],
  ['both layout options survive', AFTER.css.includes('data-cpwa-layout="gaon"')],
];
for (const [what, ok] of guards) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) regressions += 1;
}
process.exit(regressions ? 1 : 0);
