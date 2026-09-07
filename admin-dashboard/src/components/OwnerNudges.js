import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { apiFetch } from '../lib/api';
import { useLang, canReadAloud, languageCapability } from '../lib/i18n';
import { useSpeech } from '../lib/useSpeech';

// Owner Help "lane A" (Phase F): the "Today at your shop" nudge cards on the
// owner home. Reads the shop-scoped GET /api/insights/owner payload and renders
// each nudge as one calm, localized one-line card with an optional action link
// and a small read-aloud speaker. A single Play/Pause control reads all the
// nudges in sequence via the shared Web-Speech hook (useSpeech) in the owner's
// chosen language.
//
// The cards themselves are DECOUPLED from speech support: they always render
// whenever there are nudges, so the widget still appears in an Android WebView
// (which usually lacks window.speechSynthesis). ONLY the read-aloud controls (the
// Play/Pause toggle and the per-row 🔊 buttons) are gated — on TTS support AND a
// real local voice for the language, so a language with no voice never offers a
// button that would speak the wrong language.

// tone → a calm colour (not an alarm). good=green, attention=amber, info=neutral.
const TONE_COLOR = {
  good: 'var(--accent)',
  attention: '#f59e0b',
  info: 'var(--muted)',
};

// Integer paise → an Indian-grouped rupee number STRING (no ₹ — the template
// carries the symbol). Whole rupees have no decimals; otherwise two places.
function fmtRupees(paise) {
  const r = Number(paise || 0) / 100;
  return Number.isInteger(r)
    ? r.toLocaleString('en-IN')
    : r.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function OwnerNudges() {
  const router = useRouter();
  const { t, lang } = useLang();
  const { speak, pause, speaking, ttsSupported, ttsVoiceAvailable } = useSpeech();
  // Only offer read-aloud when the language can be read AND a real local voice
  // exists for it — otherwise the button would speak the wrong language (Batch B
  // capability + runtime voice detection).
  const readAloudOk = ttsSupported && canReadAloud(lang, languageCapability(lang)) && ttsVoiceAvailable;
  const [nudges, setNudges] = useState(null); // null = loading
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    apiFetch('/api/insights/owner')
      .then((d) => { if (active) setNudges(Array.isArray(d.nudges) ? d.nudges : []); })
      .catch(() => { if (active) setError(t('own.loadError')); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build the display vars for a nudge: amounts formatted from *_paise, the
  // weekday index mapped to a localized name, counts passed through as numbers.
  const varsFor = (n) => {
    const v = { ...(n.vars || {}) };
    if (n.amount_paise != null) v.amount = fmtRupees(n.amount_paise);
    if (n.delta_paise != null) v.delta = fmtRupees(n.delta_paise);
    if (v.dow != null) v.day = t(`own.day.${v.dow}`);
    return v;
  };

  const sentence = (n) => t(n.key, varsFor(n));

  // Speak every nudge in sequence. speak() cancels anything queued, so we join
  // the sentences into one utterance — lightweight and order-preserving.
  const listenAll = () => {
    if (!nudges || !nudges.length) return;
    speak(nudges.map(sentence).join('. '));
  };

  // While loading, render nothing (the rest of the dashboard shows immediately).
  if (nudges === null && !error) return null;

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0 }}>{t('own.todayTitle')}</h3>
          <div className="muted">{t('own.subtitle')}</div>
        </div>
        {readAloudOk && nudges && nudges.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            {speaking ? (
              <button type="button" onClick={pause}>⏸ {t('own.pause')}</button>
            ) : (
              <button type="button" onClick={listenAll}>🔊 {t('own.listen')}</button>
            )}
          </div>
        )}
      </div>

      {error && <div style={{ color: 'var(--danger)', marginTop: 12 }}>{error}</div>}

      {!error && nudges && nudges.length === 0 && (
        <div className="muted" style={{ marginTop: 12 }}>{t('own.empty')}</div>
      )}

      {!error && nudges && nudges.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          {nudges.map((n) => {
            const text = sentence(n);
            return (
              <div
                key={n.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: '#0b1220',
                  borderLeft: `4px solid ${TONE_COLOR[n.tone] || 'var(--muted)'}`,
                }}
              >
                <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1 }}>{n.icon}</span>
                <div style={{ flex: 1 }}>
                  <div>{text}</div>
                  {n.action === 'remind' && (
                    <a
                      href="/customers"
                      onClick={(e) => { e.preventDefault(); router.push('/customers'); }}
                      style={{ fontSize: 13 }}
                    >
                      {t('own.remind')}
                    </a>
                  )}
                </div>
                {readAloudOk && (
                  <button
                    type="button"
                    className="secondary"
                    aria-label={t('own.listen')}
                    onClick={() => speak(text)}
                    style={{ padding: '6px 10px' }}
                  >
                    🔊
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
