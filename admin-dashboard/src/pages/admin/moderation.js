import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import ModerationQueue from '../../components/ModerationQueue';
import { apiFetch } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { usePermissions } from '../../lib/adminPerms';

// The platform-admin moderation desk.
//
// It used to be the audit log and nothing else, which made the one nav item
// called "Moderation" a dead end: an admin who came here to moderate something
// found a table of what had already been decided and no way to decide anything.
// The queue was real, but it was on the Campaigns desk, behind a nav item nobody
// would look under for this.
//
// So the page now answers both questions, in the order they are asked:
//   1. what is waiting for me      — <ModerationQueue/>, needs ads:manage
//   2. what was decided, and by whom — the audit log, needs audit:view
//
// The two halves are permissioned separately because the backend permissions
// are: the marketing role holds ads:manage and not audit:view; the moderation
// and support roles hold audit:view and not ads:manage; super holds both. Each
// half is loaded only when its own permission is there, so neither role sees a
// 403 for the half that is not theirs.
export default function AdminModeration() {
  const router = useRouter();
  const { t } = useLang();
  const { ready, has } = usePermissions();
  const canReadLog = has('audit:view');
  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (cur) => {
    if (!canReadLog) return;
    setLoading(true);
    try {
      const q = cur ? `?cursor=${encodeURIComponent(cur)}` : '';
      const r = await apiFetch(`/api/admin/moderation-log${q}`);
      setRows((prev) => (cur ? [...prev, ...(r.items || [])] : (r.items || [])));
      setCursor(r.next_cursor || null);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [canReadLog]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') !== 'admin') { router.replace('/'); return; }
    if (canReadLog) load(null);
  }, [canReadLog, load, router]);

  if (!ready) return <Shell><div className="card">{t('common.loading')}</div></Shell>;

  return (
    <Shell>
      <button className="secondary" onClick={() => router.push('/admin')} style={{ marginBottom: 12 }}>← {t('nav.platform')}</button>
      <h1>{t('mod.pageTitle')}</h1>
      <p className="muted">{t('mod.pageSubtitle')}</p>

      {/* What is still undecided. Renders nothing without ads:manage. */}
      <ModerationQueue onDecision={() => load(null)} />

      {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}

      {/* What was decided — the record, newest first. */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t('mod.logTitle')}</h3>
        <p className="muted">{t('mod.logSubtitle')}</p>
        {!canReadLog ? (
          <div className="muted">{t('mod.noPermission')}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left' }}>
                  <th style={cell}>{t('mod.colWhen')}</th>
                  <th style={cell}>{t('mod.colAction')}</th>
                  <th style={cell}>{t('mod.colTarget')}</th>
                  <th style={cell}>{t('mod.colReason')}</th>
                  <th style={cell}>{t('mod.colWho')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && !loading && (
                  <tr><td style={cell} colSpan={5} className="muted">{t('mod.logEmpty')}</td></tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={cell} className="muted">{new Date(r.created_at).toLocaleString()}</td>
                    <td style={cell}><code>{r.action}</code></td>
                    <td style={cell}>
                      {r.target_label || '—'}
                      <div className="muted" style={{ fontSize: 12 }}>{r.target_type}</div>
                    </td>
                    <td style={cell}>{r.reason || '—'}</td>
                    <td style={cell}>{r.admin_name || r.admin_email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {cursor && (
          <button className="secondary" disabled={loading} onClick={() => load(cursor)} style={{ marginTop: 12 }}>
            {t('mod.loadMore')}
          </button>
        )}
      </div>
    </Shell>
  );
}

const cell = { padding: '8px 10px', verticalAlign: 'top' };

function Shell({ children }) {
  return (<div><Nav /><div className="container">{children}</div></div>);
}
