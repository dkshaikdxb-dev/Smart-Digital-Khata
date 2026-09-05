import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import { apiFetch } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { usePermissions } from '../../lib/adminPerms';

// Platform-admin consumer moderation (Phase C). Search consumer logins by phone
// or name and block / unblock an account for fraud or policy violations. A block
// stops the consumer from completing OTP login and from acting with an existing
// token. Visible only to admins with customers:view; the block/unblock controls
// only to customers:moderate.
export default function AdminCustomers() {
  const router = useRouter();
  const { t } = useLang();
  const { ready, has } = usePermissions();
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');

  const canModerate = has('customers:moderate');

  const reload = useCallback(async (q) => {
    const r = await apiFetch(`/api/admin/customers${q ? `?search=${encodeURIComponent(q)}` : ''}`);
    setRows(r.items || []);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') !== 'admin') { router.replace('/'); return; }
    reload('').catch((e) => setError(e.message));
  }, [reload, router]);

  async function submit(e) {
    e.preventDefault();
    setError(''); setMsg('');
    try { await reload(search.trim()); } catch (err) { setError(err.message); }
  }

  async function toggleBlock(c) {
    setError(''); setMsg('');
    const blocking = c.status !== 'blocked';
    const reason = window.prompt(t(blocking ? 'mod.blockReason' : 'mod.unblockReason'), '');
    if (reason === null) return;
    if (blocking && !reason.trim()) { setError(t('mod.reasonRequired')); return; }
    setBusy(c.id);
    try {
      await apiFetch(`/api/admin/customers/${c.id}/${blocking ? 'block' : 'unblock'}`, {
        method: 'POST', body: JSON.stringify({ reason: reason.trim() }),
      });
      await reload(search.trim());
      setMsg(t(blocking ? 'mod.blocked' : 'mod.unblocked'));
    } catch (err) { setError(err.message); } finally { setBusy(''); }
  }

  if (!ready) return <Shell><div className="card">{t('common.loading')}</div></Shell>;

  return (
    <Shell>
      <button className="secondary" onClick={() => router.push('/admin')} style={{ marginBottom: 12 }}>← {t('nav.platform')}</button>
      <h1>{t('mod.consumersTitle')}</h1>
      <p className="muted">{t('mod.consumersSubtitle')}</p>

      <form className="card" onSubmit={submit} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('mod.searchPlaceholder')} style={{ minWidth: 220 }} />
        <button type="submit">{t('mod.search')}</button>
      </form>

      {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}
      {msg && <div className="card" style={{ color: 'var(--accent)' }}>{msg}</div>}

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th style={cell}>{t('mod.colPhone')}</th>
              <th style={cell}>{t('mod.colName')}</th>
              <th style={cell}>{t('mod.status')}</th>
              <th style={cell}>{t('mod.colLastLogin')}</th>
              {canModerate && <th style={cell}>{t('mod.colActions')}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td style={cell} colSpan={canModerate ? 5 : 4} className="muted">{t('mod.consumersEmpty')}</td></tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                <td style={cell}><code>{c.phone}</code></td>
                <td style={cell}>{c.name || '—'}</td>
                <td style={cell}>
                  <span className="badge" style={c.status === 'blocked' ? { background: 'var(--danger)', color: '#fff' } : undefined}>
                    {c.status === 'blocked' ? t('mod.statusBlocked') : t('mod.statusActive')}
                  </span>
                </td>
                <td style={cell} className="muted">{c.last_login_at ? new Date(c.last_login_at).toLocaleString() : t('mod.never')}</td>
                {canModerate && (
                  <td style={cell}>
                    <button className="secondary" disabled={busy === c.id}
                      style={c.status === 'blocked' ? undefined : { background: 'var(--danger)', color: '#fff' }}
                      onClick={() => toggleBlock(c)}>
                      {c.status === 'blocked' ? t('mod.unblock') : t('mod.block')}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

const cell = { padding: '8px 10px', verticalAlign: 'top' };

function Shell({ children }) {
  return (<div><Nav /><div className="container">{children}</div></div>);
}
