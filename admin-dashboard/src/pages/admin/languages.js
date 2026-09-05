import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import { apiFetch } from '../../lib/api';
import { useLang } from '../../lib/i18n';

// Platform-admin language activation registry (Phase B). Every supported
// language has a row here; the single Activate / Deactivate button per row is
// the "one button" — it flips a launch-ready language on for everyone with no
// code deploy. New state languages can be pre-staged with the Add form and
// switched on later, after a native-speaker audit of their translations.
export default function AdminLanguages() {
  const router = useRouter();
  const { t } = useLang();
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  async function reload() {
    const r = await apiFetch('/api/admin/languages');
    setRows(r.languages || []);
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') !== 'admin') { router.replace('/'); return; }
    reload().catch((e) => setError(e.message || t('alang.loadError'))).finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function patch(code, body) {
    setBusy(code); setError('');
    try {
      await apiFetch(`/api/admin/languages/${code}`, { method: 'PATCH', body: JSON.stringify(body) });
      await reload();
    } catch (e) {
      setError(e.message || t('alang.saveError'));
    } finally {
      setBusy('');
    }
  }

  if (!ready) return <Shell><div className="card">{t('common.loading')}</div></Shell>;

  return (
    <Shell>
      <button className="secondary" onClick={() => router.push('/admin')} style={{ marginBottom: 12 }}>← {t('nav.platform')}</button>
      <h1>{t('alang.title')}</h1>
      <p className="muted">{t('alang.subtitle')}</p>
      <div className="card" style={{ borderLeft: '3px solid var(--accent)' }}>{t('alang.note')}</div>

      {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th style={cell}>{t('alang.colLanguage')}</th>
              <th style={cell}>{t('alang.colEnglish')}</th>
              <th style={cell}>{t('alang.colRtl')}</th>
              <th style={cell}>{t('alang.colAudit')}</th>
              <th style={cell}>{t('alang.colActive')}</th>
              <th style={cell}>{t('alang.colActivated')}</th>
              <th style={cell}>{t('alang.colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.code} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                <td style={cell}>
                  <strong dir={l.rtl ? 'rtl' : 'ltr'}>{l.label}</strong>{' '}
                  <code style={{ fontSize: 12 }}>{l.code}</code>
                </td>
                <td style={cell}>{l.english_name}</td>
                <td style={cell}>{l.rtl ? t('alang.yes') : t('alang.no')}</td>
                <td style={cell}>
                  <select
                    value={l.audit_status}
                    disabled={busy === l.code}
                    onChange={(e) => patch(l.code, { audit_status: e.target.value })}
                  >
                    <option value="pending">{t('alang.statusPending')}</option>
                    <option value="in_review">{t('alang.statusInReview')}</option>
                    <option value="audited">{t('alang.statusAudited')}</option>
                  </select>
                </td>
                <td style={cell}>
                  <span className="badge" style={l.is_active ? { background: 'var(--accent)', color: '#000' } : undefined}>
                    {l.is_active ? t('alang.activeBadge') : t('alang.inactiveBadge')}
                  </span>
                </td>
                <td style={cell} className="muted">
                  {l.activated_at ? new Date(l.activated_at).toLocaleDateString() : t('alang.never')}
                </td>
                <td style={cell}>
                  {l.is_active ? (
                    <button className="secondary" disabled={busy === l.code} onClick={() => patch(l.code, { is_active: false })}>
                      {t('alang.deactivate')}
                    </button>
                  ) : (
                    <button disabled={busy === l.code} onClick={() => patch(l.code, { is_active: true })}>
                      {t('alang.activate')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AddLanguage t={t} onAdded={() => reload().catch((e) => setError(e.message))} onError={setError} />
    </Shell>
  );
}

const cell = { padding: '8px 10px', verticalAlign: 'top' };

function AddLanguage({ t, onAdded, onError }) {
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [english, setEnglish] = useState('');
  const [rtl, setRtl] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState(false);

  async function add() {
    setSaving(true); setOk(false); onError('');
    try {
      await apiFetch('/api/admin/languages', {
        method: 'POST',
        body: JSON.stringify({ code: code.trim().toLowerCase(), label: label.trim(), english_name: english.trim(), rtl }),
      });
      setCode(''); setLabel(''); setEnglish(''); setRtl(false);
      setOk(true);
      onAdded();
    } catch (e) {
      onError(e.message || t('alang.saveError'));
    } finally {
      setSaving(false);
    }
  }

  const canAdd = code.trim() && label.trim() && english.trim() && !saving;

  return (
    <div className="card" style={{ display: 'grid', gap: 10 }}>
      <h3>{t('alang.addTitle')}</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <input placeholder={t('alang.fCode')} value={code} onChange={(e) => setCode(e.target.value)} style={{ width: 140 }} />
        <input placeholder={t('alang.fLabel')} value={label} dir={rtl ? 'rtl' : 'ltr'} onChange={(e) => setLabel(e.target.value)} style={{ minWidth: 160 }} />
        <input placeholder={t('alang.fEnglish')} value={english} onChange={(e) => setEnglish(e.target.value)} style={{ minWidth: 160 }} />
        <label className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={rtl} onChange={(e) => setRtl(e.target.checked)} />
          {t('alang.fRtl')}
        </label>
        <button disabled={!canAdd} onClick={add}>{t('alang.addBtn')}</button>
        {ok && <span style={{ color: 'var(--accent)' }}>✓ {t('alang.added')}</span>}
      </div>
    </div>
  );
}

function Shell({ children }) {
  return (<div><Nav /><div className="container">{children}</div></div>);
}
