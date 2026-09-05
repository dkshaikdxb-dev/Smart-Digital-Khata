import { useLang } from '../lib/i18n';

// Static, localized Help / FAQ — a plain collapsible list, NOT an AI bot. The
// entries live in i18n as help.eN.q (title) + help.eN.a (body); en + hi are
// authored, ta/te/kn/ml/ur fall back to English (seed) until a native QA pass.
// Rendered on both the owner and consumer account pages.
const ENTRY_COUNT = 13;

export default function HelpFaq({ variant }) {
  const { t } = useLang();
  const entries = [];
  for (let i = 1; i <= ENTRY_COUNT; i += 1) {
    entries.push({ q: t(`help.e${i}.q`), a: t(`help.e${i}.a`) });
  }
  const cls = variant === 'cpwa' ? 'card' : 'card';
  return (
    <div className={cls} style={{ maxWidth: variant === 'cpwa' ? undefined : 640 }}>
      <h3>{t('help.title')}</h3>
      <p className="muted">{t('help.subtitle')}</p>
      <div style={{ display: 'grid', gap: 6 }}>
        {entries.map((e, idx) => (
          <details key={idx} className="help-entry">
            <summary style={{ cursor: 'pointer', padding: '8px 0', fontWeight: 600 }}>{e.q}</summary>
            <div className="muted" style={{ padding: '2px 0 8px' }}>{e.a}</div>
          </details>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 10 }}>{t('help.manualLink')}</p>
    </div>
  );
}
