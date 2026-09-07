import { setLang, useActiveLanguages, translate } from '../lib/i18n';

// First-open language chooser for the customer app. Shown full-screen the very
// first time someone opens any /c page and has not yet picked a language, so a
// non-English speaker lands in their own language before doing anything. Each
// button is the language's own name in its own script, so it needs no reading
// of another language to choose. The choices come from the active language
// registry (useActiveLanguages), falling back to the built-in LANGS before it
// resolves / offline — so the gate always works. Tapping one persists the
// choice (setLang marks it chosen) and dismisses the gate for good.
export default function CustomerLangGate({ onDone }) {
  const langs = useActiveLanguages();
  function pick(code) {
    setLang(code);
    onDone();
  }
  return (
    <div className="cpwa-langgate" role="dialog" aria-modal="true" aria-label="Choose language">
      <div className="cpwa-langgate-card">
        <div className="cpwa-langgate-ico" aria-hidden="true">🌐</div>
        <h1 className="cpwa-langgate-title">
          भाषा चुनें
          <span>Choose your language</span>
        </h1>
        <div className="cpwa-langgate-list">
          {langs.map((l) => (
            <button
              key={l.code}
              type="button"
              className="cpwa-langgate-btn"
              dir={l.rtl ? 'rtl' : 'ltr'}
              onClick={() => pick(l.code)}
            >
              {/* An honest " (beta)"-style suffix for an ACTIVE language with no
                  localized catalogue yet (has_catalogue === false, from the
                  registry), localized in the language's own script. Checked
                  `=== false` so the built-in LANGS fallback (no capability flags
                  before the registry loads) shows no spurious suffix. The
                  language stays fully selectable — never removed or disabled. */}
              {l.has_catalogue === false ? `${l.name}${translate(l.code, 'lang.betaSuffix')}` : l.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
