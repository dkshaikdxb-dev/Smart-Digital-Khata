/**
 * The stylesheet the storefront is repainted with.
 *
 * Two things are worth pinning here, and neither is visible in a screenshot:
 * that the default colour produces NOTHING (so a platform that never changed
 * its accent is not restyled by a deploy), and that the selectors are the same
 * four the stylesheet already uses — because if they drift, the cascade quietly
 * picks a different winner and half the app stays the old colour.
 */
const fs = require('node:fs');
const path = require('node:path');
const { accentCss, applyAccentCss, DEFAULT_ACCENT, STYLE_ID, CACHE_KEY } = require('../src/lib/accentCss.js');

// A family shaped exactly as the server sends it.
const family = (accent) => ({
  app: { accent, on_accent: '#04220f' },
  light: { accent: '#1daa51', on_accent: '#04220f', ink: '#17823e', soft: '#e6f5eb', soft_border: '#bae8cb' },
  dark: { accent: '#22c45d', on_accent: '#04220f', ink: '#22c45d', soft: '#163622', soft_border: '#277243' },
});

describe('what gets written, and when nothing does', () => {
  it('says nothing at all for the colour the stylesheet already ships', () => {
    // The inert case. globals.css's greens were picked by hand; the derivation
    // lands near them but not on them, and a deploy must not restyle a
    // storefront whose operator never asked for a different colour.
    expect(accentCss(family(DEFAULT_ACCENT))).toBe('');
  });

  it('knows the same default green the server does', () => {
    // accentCss.js has to name the shipped colour to recognise the inert case,
    // which makes it one more place that string lives. If it drifts from the
    // server's, the inert case stops being recognised and every deploy quietly
    // restyles a storefront nobody asked to restyle.
    const api = require(path.join(__dirname, '../../backend/src/utils/contrast.js'));
    expect(DEFAULT_ACCENT).toBe(api.DEFAULT_ACCENT);
    // And it is the colour the stylesheet actually ships.
    const globals = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles', 'globals.css'), 'utf8');
    expect(globals).toContain(`--accent: ${DEFAULT_ACCENT};`);
  });

  it('says nothing for a family that is not one', () => {
    expect(accentCss(null)).toBe('');
    expect(accentCss(undefined)).toBe('');
    expect(accentCss({})).toBe('');
    expect(accentCss({ app: { accent: '#ff8800' } })).toBe('');
  });

  it('refuses a family carrying anything that is not a plain hex', () => {
    // The server normalises before it sends, so a value in any other shape
    // means something upstream is wrong — and a string that reaches a <style>
    // tag is not one to be lenient about.
    const bad = family('#ff8800');
    bad.light.ink = 'red';
    expect(accentCss(bad)).toBe('');

    const worse = family('#ff8800');
    worse.dark.soft = '#fff;}</style><script>x()</script>';
    expect(accentCss(worse)).toBe('');

    const shorthand = family('#ff8800');
    shorthand.light.accent = '#f80';
    expect(accentCss(shorthand)).toBe('');
  });

  it('writes every token of both themes when the colour has changed', () => {
    const css = accentCss(family('#ff8800'));
    expect(css).toContain('--accent:#ff8800');
    expect(css).toContain('--on-accent:#04220f');
    for (const v of ['#1daa51', '#17823e', '#e6f5eb', '#bae8cb']) expect(css).toContain(v);
    for (const v of ['#22c45d', '#163622', '#277243']) expect(css).toContain(v);
  });
});

describe('the selectors match the stylesheet they are overriding', () => {
  // If these drift from globals.css, the cascade picks a different winner and
  // the app is left half-repainted — the failure this whole file exists for.
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles', 'globals.css'), 'utf8');
  const out = accentCss(family('#ff8800'));

  const SELECTORS = [
    '.cpwa{',
    '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .cpwa{',
    ':root[data-theme="dark"] .cpwa{',
    ':root[data-theme="light"] .cpwa{',
  ];

  it('emits all four of the consumer theme blocks', () => {
    for (const s of SELECTORS) expect(out).toContain(s);
  });

  it('each one exists in globals.css too, spelled the same way', () => {
    const flat = css.replace(/\s+/g, ' ');
    expect(flat).toContain('.cpwa {');
    expect(flat).toContain(':root:not([data-theme="light"]) .cpwa {');
    expect(flat).toContain(':root[data-theme="dark"] .cpwa {');
    expect(flat).toContain(':root[data-theme="light"] .cpwa {');
    expect(flat).toContain('@media (prefers-color-scheme: dark) {');
  });

  it('overrides exactly the five accent tokens the stylesheet defines, and nothing else', () => {
    const wrote = Array.from(new Set(out.match(/--[a-z-]+:/g))).sort();
    expect(wrote).toEqual([
      '--accent:', '--c-accent-ink:', '--c-accent-soft-border:', '--c-accent-soft:',
      '--c-accent:', '--c-on-accent:', '--on-accent:',
    ].sort());
  });
});

describe('putting it on the page, and taking it off again', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    window.localStorage.clear();
  });

  it('adds one style element and remembers it for the next visit', () => {
    const css = accentCss(family('#ff8800'));
    applyAccentCss(css);
    const el = document.getElementById(STYLE_ID);
    expect(el).not.toBeNull();
    expect(el.textContent).toBe(css);
    expect(window.localStorage.getItem(CACHE_KEY)).toBe(css);
  });

  it('replaces rather than stacks when the colour changes again', () => {
    applyAccentCss(accentCss(family('#ff8800')));
    applyAccentCss(accentCss(family('#0055ff')));
    expect(document.querySelectorAll(`#${STYLE_ID}`).length).toBe(1);
    expect(document.getElementById(STYLE_ID).textContent).toContain('#0055ff');
  });

  it('an empty stylesheet puts the storefront back — on the page AND in the cache', () => {
    // How a festive window ending undoes itself. Leaving the remembered copy
    // behind would repaint the old colour before paint on the next visit, with
    // nothing on the server still asking for it.
    applyAccentCss(accentCss(family('#ff8800')));
    applyAccentCss('');
    expect(document.getElementById(STYLE_ID)).toBeNull();
    expect(window.localStorage.getItem(CACHE_KEY)).toBeNull();
  });
});
