// Turning the server's derived accent family into a stylesheet.
//
// The colour is decided and derived on the server (backend/src/utils/contrast.js
// and theme.js). This only writes it down — no maths here, deliberately, so
// there is no second copy of the derivation to drift from the first.
//
// WHY A STYLESHEET AND NOT INLINE STYLES. The consumer app's light/dark split is
// pure CSS: four blocks in globals.css keyed on :root[data-theme] and
// prefers-color-scheme. A JS override would have to know which half is showing
// and re-run on every change; emitting the same four selectors means the
// cascade keeps deciding, exactly as it does today, and this only changes what
// the winning block says.

// The colour the stylesheet already ships. Kept in step with
// backend/src/utils/contrast.js DEFAULT_ACCENT.
export const DEFAULT_ACCENT = '#22c55e';

export const STYLE_ID = 'skhata-accent';
export const CACHE_KEY = 'skhata-accent-css';

const HEX = /^#[0-9a-f]{6}$/;

/** Every token present and already normalised, or this is not a family to paint. */
function usable(tokens) {
  if (!tokens || !tokens.app || !tokens.light || !tokens.dark) return false;
  if (!HEX.test(tokens.app.accent) || !HEX.test(tokens.app.on_accent)) return false;
  for (const theme of [tokens.light, tokens.dark]) {
    for (const k of ['accent', 'on_accent', 'ink', 'soft', 'soft_border']) {
      if (!HEX.test(theme[k] || '')) return false;
    }
  }
  return true;
}

const cpwa = (t) => `--c-accent:${t.accent};--c-on-accent:${t.on_accent};`
  + `--c-accent-ink:${t.ink};--c-accent-soft:${t.soft};--c-accent-soft-border:${t.soft_border};`;

/**
 * The stylesheet for one accent family, or '' when there is nothing to say.
 *
 * Returns '' for the SHIPPED accent as well as for a malformed one. That is the
 * inert case and it matters: the stylesheet's own green is hand-picked, the
 * derivation lands near it but not on it, and a platform that has never changed
 * its colour should not have its storefront quietly restyled by a deploy.
 *
 * The four .cpwa selectors mirror globals.css exactly — light default, dark by
 * device preference unless light is forced, dark forced, light forced — so the
 * same block wins here as wins there. The bare :root rule is the owner console
 * and the shopkeeper's web app, which are dark and take the raw colour.
 */
export function accentCss(tokens) {
  if (!usable(tokens)) return '';
  if (tokens.app.accent === DEFAULT_ACCENT) return '';
  const { app, light, dark } = tokens;
  return [
    `:root{--accent:${app.accent};--on-accent:${app.on_accent};}`,
    `.cpwa{${cpwa(light)}}`,
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .cpwa{${cpwa(dark)}}}`,
    `:root[data-theme="dark"] .cpwa{${cpwa(dark)}}`,
    `:root[data-theme="light"] .cpwa{${cpwa(light)}}`,
  ].join('');
}

/**
 * Put that stylesheet on the page, replacing any earlier one, and remember it.
 *
 * The remembered copy is read back by the inline script in _document.js before
 * the first paint, so a returning visitor never sees the shipped green flash
 * over to the festive colour. An empty stylesheet CLEARS both — that is how a
 * window ending puts the storefront back.
 */
export function applyAccentCss(css) {
  if (typeof document === 'undefined') return;
  let el = document.getElementById(STYLE_ID);
  if (!css) {
    if (el) el.remove();
    try { window.localStorage.removeItem(CACHE_KEY); } catch (_e) { /* private mode */ }
    return;
  }
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  if (el.textContent !== css) el.textContent = css;
  try { window.localStorage.setItem(CACHE_KEY, css); } catch (_e) { /* private mode */ }
}
