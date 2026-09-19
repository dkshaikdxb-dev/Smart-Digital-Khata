import { useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { accentCss, applyAccentCss } from '../lib/accentCss';

/**
 * Ask the server what colour to paint, and paint it.
 *
 * Renders nothing. Mounted once in _app.js so every page — owner console,
 * consumer storefront, a shared khata link — follows the same platform accent,
 * including whatever festive window happens to be live.
 *
 * FAILURE IS SILENT AND SAFE, at every step. The request is best-effort: if it
 * does not answer, the page keeps whatever the cached stylesheet from
 * _document.js already applied, and failing that the colour globals.css ships.
 * A theme is decoration, and no shopkeeper should see an error about one.
 *
 * The server sends a family it has already derived and normalised; this does no
 * colour maths of its own. See lib/accentCss.js.
 */
export default function AccentVars() {
  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/public/config')
      .then((cfg) => {
        if (cancelled) return;
        applyAccentCss(accentCss(cfg && cfg.theme && cfg.theme.tokens));
      })
      .catch(() => { /* keep what is already on the page */ });
    return () => { cancelled = true; };
  }, []);
  return null;
}
