import { useLang, useActiveLanguages, translate } from '../lib/i18n';

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
          {optionLabel(l)}
        </option>
      ))}
    </select>
  );
}

// The option text: the language's own name, plus an honest " (beta)"-style
// suffix for an ACTIVE language that has no localized catalogue yet
// (has_catalogue === false, from the registry). The suffix is localized in the
// option's own language via translate(l.code, ...). We check `=== false`
// explicitly so the built-in LANGS fallback (which carries no capability flags
// before the registry resolves) never shows a spurious suffix. The language is
// NOT removed or disabled — it stays fully selectable.
function optionLabel(l) {
  if (l.has_catalogue === false) return `${l.name}${translate(l.code, 'lang.betaSuffix')}`;
  return l.name;
}
