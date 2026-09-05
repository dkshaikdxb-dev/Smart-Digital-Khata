import { useLang, useActiveLanguages } from '../lib/i18n';

// Compact language dropdown for the nav chrome. A <select> scales cleanly to
// many languages (unlike a button row) and shows each language in its own
// script. `variant="cpwa"` scopes it to the customer PWA styling; default is
// the owner nav. The options come from the active language registry
// (useActiveLanguages), falling back to the built-in LANGS before it resolves /
// offline — so the switcher always works. Switches navigation labels only.
export default function LangSwitch({ variant = 'owner' }) {
  const { lang, setLang } = useLang();
  const langs = useActiveLanguages();
  const cls = variant === 'cpwa' ? 'cpwa-lang' : 'langswitch';
  return (
    <select
      className={cls}
      aria-label="Language"
      value={lang}
      onChange={(e) => setLang(e.target.value)}
    >
      {langs.map((l) => (
        <option key={l.code} value={l.code}>
          {l.name}
        </option>
      ))}
    </select>
  );
}
