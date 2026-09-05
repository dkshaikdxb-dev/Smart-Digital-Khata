import { useLang } from '../lib/i18n';
import { useSpeech } from '../lib/useSpeech';

// Static, localized Help / FAQ — a plain collapsible list, NOT an AI bot, and it
// works fully offline. The entries live in i18n as help.eN.q (title) + help.eN.a
// (body); en + hi + ur are authored, ta/te/kn/ml fall back to English (seed)
// until a native QA pass. Rendered on both the owner and consumer account pages.
//
// For the low-literacy audience each entry has a leading topic ICON and a
// read-aloud (🔊) button that speaks the ANSWER in the owner's current language,
// reusing the shared useSpeech() hook. The Listen button is hidden when the
// device has no speech synthesis (useSpeech().ttsSupported === false), so it
// never shows a dead control.
const ENTRY_COUNT = 13;

// Leading emoji per entry, hinting the topic (add-customer, udhaar, payment,
// reminders, catalogue, weighing, share, offline, language, data-saver, plans,
// statement, privacy). Emoji only — no new icon dependency.
const ENTRY_ICONS = ['👤', '📒', '💵', '🔔', '🧺', '⚖️', '🔗', '📴', '🌐', '📉', '💳', '🧾', '🔒'];

export default function HelpFaq({ variant }) {
  const { t } = useLang();
  const { ttsSupported, speak } = useSpeech();
  const entries = [];
  for (let i = 1; i <= ENTRY_COUNT; i += 1) {
    entries.push({ q: t(`help.e${i}.q`), a: t(`help.e${i}.a`), ico: ENTRY_ICONS[i - 1] || '❓' });
  }
  const cls = variant === 'cpwa' ? 'card' : 'card';
  return (
    <div className={cls} style={{ maxWidth: variant === 'cpwa' ? undefined : 640 }}>
      <h3>{t('help.title')}</h3>
      <p className="muted">{t('help.subtitle')}</p>
      <div style={{ display: 'grid', gap: 6 }}>
        {entries.map((e, idx) => (
          <details key={idx} className="help-entry">
            <summary style={{ cursor: 'pointer', padding: '8px 0', fontWeight: 600 }}>
              <span className="help-ico" aria-hidden="true">{e.ico}</span>
              <span>{e.q}</span>
            </summary>
            <div className="muted" style={{ padding: '2px 0 8px' }}>{e.a}</div>
            {ttsSupported && (
              <button
                type="button"
                className="secondary help-listen"
                onClick={() => speak(e.a)}
                aria-label={t('help.listen')}
                title={t('help.listen')}
              >
                🔊 {t('help.listen')}
              </button>
            )}
          </details>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 10 }}>{t('help.manualLink')}</p>
    </div>
  );
}
