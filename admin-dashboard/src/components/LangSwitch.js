import { LANGS, useLang } from '../lib/i18n';

// Compact language dropdown for the nav chrome. A <select> scales cleanly to
// many languages (unlike a button row) and shows each language in its own
// script. `variant="cpwa"` scopes it to the customer PWA styling; default is
// the owner nav. Switches navigation labels only (see lib/i18n.js).
export default function LangSwitch({ variant = 'owner' }) {
  const { lang, setLang } = useLang();
  const cls = variant === 'cpwa' ? 'cpwa-lang' : 'langswitch';
  return (
    <select
      className={cls}
      aria-label="Language"
      value={lang}
      onChange={(e) => setLang(e.target.value)}
    >
      {LANGS.map((l) => (
        <option key={l.code} value={l.code}>
          {l.name}
        </option>
      ))}
    </select>
  );
}
