import { useEffect, useState } from 'react';
import { useLang } from '../lib/i18n';

// "Invite & earn" card (Phase D). Shows the caller's own referral code, a
// copy-able share link built from the current origin, how many people they have
// referred (with a short list), and who referred them. Used on both the owner
// account page and the consumer account page — the only difference is the
// `fetcher` passed in (apiFetch vs customerFetch), so the same UI serves both.
export default function ReferralCard({ fetcher, endpoint = '/api/me/referral' }) {
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    fetcher(endpoint)
      .then((r) => { if (alive) setData(r); })
      .catch((e) => { if (alive) setError(e.message || t('ref.loadError')); });
    return () => { alive = false; };
  }, [fetcher, endpoint, t]);

  // Prefer an origin-relative absolute URL so the link always points at the app
  // the viewer is using, not whatever host the API happened to report.
  const shareLink = () => {
    if (!data) return '';
    if (typeof window !== 'undefined' && data.link_path) return `${window.location.origin}${data.link_path}`;
    return data.link || '';
  };

  async function copy() {
    const link = shareLink();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        const ta = document.createElement('textarea');
        ta.value = link; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); ta.remove();
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked — the link is shown for manual copy */ }
  }

  if (error) return (<div className="card" style={{ color: 'var(--danger)' }}>{error}</div>);
  if (!data) return (<div className="card">{t('common.loading')}</div>);

  const link = shareLink();

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{t('ref.title')}</h3>
      <p className="muted">{t('ref.subtitle')}</p>

      <label className="muted">{t('ref.yourCode')}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <code style={{ fontSize: 20, fontWeight: 700, letterSpacing: 2 }}>{data.code}</code>
      </div>
      <div style={{ height: 10 }} />

      <label className="muted">{t('ref.shareLink')}</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={link} readOnly onFocus={(e) => e.target.select()} style={{ flex: 1, minWidth: 200 }} dir="ltr" />
        <button type="button" onClick={copy}>{copied ? t('ref.copied') : t('ref.copyLink')}</button>
      </div>
      <div style={{ height: 14 }} />

      <div className="muted">
        {t('ref.referredCount', { n: data.counts ? data.counts.referred_total : 0 })}
      </div>
      {data.referred && data.referred.length > 0 ? (
        <ul style={{ margin: '8px 0 0', paddingInlineStart: 18 }}>
          {data.referred.slice(0, 10).map((r) => (
            <li key={r.id}>
              {r.label || t(`ref.type.${r.referred_type}`)}
              {r.source_channel ? <span className="muted"> · {r.source_channel}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="muted" style={{ marginTop: 6 }}>{t('ref.noneYet')}</div>
      )}

      {data.referred_by && (
        <div style={{ marginTop: 14 }}>
          <span className="muted">{t('ref.referredByLabel')} </span>
          <strong>{data.referred_by.label || data.referred_by.code}</strong>
          {data.referred_by.code && <span className="muted"> ({data.referred_by.code})</span>}
        </div>
      )}
    </div>
  );
}
