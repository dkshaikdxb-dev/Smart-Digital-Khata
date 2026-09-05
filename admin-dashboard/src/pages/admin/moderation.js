import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import { apiFetch } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { usePermissions } from '../../lib/adminPerms';

// Platform-admin moderation audit log (Phase C). Every block, unblock, shop
// suspension/reinstatement and admin-role change, newest first. Read-only;
// visible to admins with audit:view.
export default function AdminModeration() {
  const router = useRouter();
  const { t } = useLang();
  const { ready } = usePermissions();
  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (cur) => {
    setLoading(true);
    try {
      const q = cur ? `?cursor=${encodeURIComponent(cur)}` : '';
      const r = await apiFetch(`/api/admin/moderation-log${q}`);
      setRows((prev) => (cur ? [...prev, ...(r.items || [])] : (r.items || [])));
      setCursor(r.next_cursor || null);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') !== 'admin') { router.replace('/'); return; }
    load(null);
  }, [load, router]);

  if (!ready) return <Shell><div className="card">{t('common.loading')}</div></Shell>;

  return (
    <Shell>
      <button className="secondary" onClick={() => router.push('/admin')} style={{ marginBottom: 12 }}>← {t('nav.platform')}</button>
      <h1>{t('mod.logTitle')}</h1>
      <p className="muted">{t('mod.logSubtitle')}</p>

      {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}

      <div className="card" style={{ overflowX: 'auto' }}>
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
              <tr key={r.id} style={{ borderTop: '1px solid var(--border, #eee)' }}>
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

      {cursor && (
        <button className="secondary" disabled={loading} onClick={() => load(cursor)} style={{ marginTop: 12 }}>
          {t('mod.loadMore')}
        </button>
      )}
    </Shell>
  );
}

const cell = { padding: '8px 10px', verticalAlign: 'top' };

function Shell({ children }) {
  return (<div><Nav /><div className="container">{children}</div></div>);
}
