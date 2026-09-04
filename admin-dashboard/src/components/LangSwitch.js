import { LANGS, useLang } from '../lib/i18n';

// Compact language toggle for the nav chrome. `variant="cpwa"` scopes it to the
// customer PWA styling; default is the owner nav. Only switches the language of
// navigation labels for now (see lib/i18n.js).
export default function LangSwitch({ variant = 'owner' }) {
  const { lang, setLang } = useLang();
  const cls = variant === 'cpwa' ? 'cpwa-lang' : 'langswitch';
  return (
    <div className={cls} role="group" aria-label="Language">
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          className={lang === l.code ? 'active' : ''}
          aria-pressed={lang === l.code}
          title={l.name}
          onClick={() => setLang(l.code)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
