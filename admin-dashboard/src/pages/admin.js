import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../components/Nav';
import DataTable from '../components/DataTable';
import DownloadList from '../components/DownloadList';
import { apiFetch } from '../lib/api';
import { useLang } from '../lib/i18n';
import { usePermissions } from '../lib/adminPerms';

const fmt = (paise) => `₹${(Number(paise || 0) / 100).toFixed(2)}`;
const ADMIN_ROLES = ['super', 'support', 'finance', 'moderation'];

export default function PlatformAdmin() {
  const router = useRouter();
  const { t } = useLang();
  const { has } = usePermissions();
  const [stats, setStats] = useState(null);
  const [shops, setShops] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const canModerateUsers = has('users:moderate');
  const canManageAdmins = has('admin:manage');

  // Each export is shown only when the caller's permission set allows the data
  // it emits — matching the requirePerm gate on the backend route.
  const downloadItems = [
    has('shops:view') && { key: 'shops', label: t('dl.shops'), filename: 'shops.csv', path: '/api/admin/exports/shops.csv' },
    has('users:view') && { key: 'users', label: t('dl.users'), filename: 'users.csv', path: '/api/admin/exports/users.csv' },
    has('audit:view') && { key: 'moderationLog', label: t('dl.moderationLog'), filename: 'moderation-log.csv', path: '/api/admin/exports/moderation-log.csv' },
    has('revenue:view') && { key: 'referrals', label: t('dl.referrals'), filename: 'referrals.csv', path: '/api/admin/exports/referrals.csv' },
    has('revenue:view') && { key: 'revenue', label: t('dl.revenue'), filename: 'revenue.csv', path: '/api/admin/exports/revenue.csv' },
  ].filter(Boolean);

  const reloadUsers = useCallback(async () => {
    const u = await apiFetch('/api/admin/users');
    setUsers(u.items);
  }, []);

  useEffect(() => {
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') !== 'admin') { router.replace('/'); return; }
    Promise.all([
      apiFetch('/api/admin/stats'),
      apiFetch('/api/admin/shops'),
      apiFetch('/api/admin/users'),
    ])
      .then(([s, sh, u]) => { setStats(s); setShops(sh.items); setUsers(u.items); })
      .catch((e) => setError(e.message));
  }, [router]);

  async function toggleBlock(u) {
    setError(''); setMsg('');
    const blocking = u.status !== 'blocked';
    const reason = window.prompt(t(blocking ? 'mod.blockReason' : 'mod.unblockReason'), '');
    if (reason === null) return; // cancelled
    if (blocking && !reason.trim()) { setError(t('mod.reasonRequired')); return; }
    try {
      await apiFetch(`/api/admin/users/${u.id}/${blocking ? 'block' : 'unblock'}`, {
        method: 'POST', body: JSON.stringify({ reason: reason.trim() }),
      });
      await reloadUsers();
      setMsg(t(blocking ? 'mod.blocked' : 'mod.unblocked'));
    } catch (e) { setError(e.message); }
  }

  async function setAdminRole(u, adminRole) {
    setError(''); setMsg('');
    try {
      await apiFetch(`/api/admin/users/${u.id}/admin-role`, {
        method: 'PATCH', body: JSON.stringify({ admin_role: adminRole || null }),
      });
      await reloadUsers();
      setMsg(t('rbac.roleSet'));
    } catch (e) { setError(e.message); }
  }

  const userColumns = [
    { key: 'name', label: 'Name', render: (u) => <strong>{u.name}</strong> },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'role', label: 'Role', render: (u) => <span className="badge">{u.role}</span> },
    { key: 'status', label: t('mod.usersStatusCol'), render: (u) => (
      <span className="badge" style={u.status === 'blocked' ? { background: 'var(--danger)', color: '#fff' } : undefined}>
        {u.status === 'blocked' ? t('mod.statusBlocked') : t('mod.statusActive')}
      </span>
    ) },
    { key: 'admin_role', label: t('mod.usersRoleCol'), render: (u) => (
      u.role === 'admin'
        ? (canManageAdmins
            ? (
              <select value={u.admin_role || ''} onClick={(e) => e.stopPropagation()} onChange={(e) => setAdminRole(u, e.target.value)}>
                <option value="">{t('rbac.role.none')}</option>
                {ADMIN_ROLES.map((r) => <option key={r} value={r}>{t(`rbac.role.${r}`)}</option>)}
              </select>
            )
            : <span className="muted">{u.admin_role ? t(`rbac.role.${u.admin_role}`) : t('rbac.role.none')}</span>)
        : <span className="muted">—</span>
    ) },
    { key: 'created_at', label: 'Joined', render: (u) => new Date(u.created_at).toLocaleDateString() },
  ];
  if (canModerateUsers) {
    userColumns.push({ key: 'actions', label: t('mod.colActions'), render: (u) => (
      <button className="secondary" style={u.status === 'blocked' ? undefined : { background: 'var(--danger)', color: '#fff' }}
        onClick={(e) => { e.stopPropagation(); toggleBlock(u); }}>
        {u.status === 'blocked' ? t('mod.unblock') : t('mod.block')}
      </button>
    ) });
  }

  return (
    <div>
      <Nav />
      <div className="container">
        <h1>Platform overview</h1>
        {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}
        {msg && <div className="card" style={{ color: 'var(--accent)' }}>{msg}</div>}

        <div className="grid">
          <div className="card"><div className="muted">MRR</div><div className="kpi" style={{ color: 'var(--accent)' }}>{stats ? fmt(stats.mrr) : '—'}</div><div className="muted">{stats ? `${stats.plan_counts.pro} Pro · ${stats.plan_counts.family} Family` : ''}</div></div>
          <div className="card"><div className="muted">Shops</div><div className="kpi">{stats ? stats.shops : '—'}</div><div className="muted">{stats && stats.suspended_shops ? `${stats.suspended_shops} suspended` : 'all active'}</div></div>
          <div className="card"><div className="muted">Users</div><div className="kpi">{stats ? stats.users : '—'}</div></div>
          <div className="card"><div className="muted">Transactions</div><div className="kpi">{stats ? stats.transactions : '—'}</div></div>
          <div className="card"><div className="muted">Outstanding (platform)</div><div className="kpi">{stats ? fmt(stats.outstanding_total) : '—'}</div></div>
        </div>

        <div className="card">
          <h3>Shops <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>— tap a shop to manage</span></h3>
          <DataTable
            empty="No shops yet."
            onRowClick={(s) => router.push(`/admin/shops/${s.id}`)}
            columns={[
              { key: 'name', label: 'Shop', render: (s) => <strong>{s.name}</strong> },
              { key: 'plan', label: 'Plan', render: (s) => <span className="badge">{s.plan}</span> },
              { key: 'status', label: 'Status', render: (s) => (
                <span className="badge" style={s.status === 'suspended' ? { background: 'var(--danger)', color: '#fff' } : undefined}>{s.status || 'active'}</span>
              ) },
              { key: 'customers_count', label: 'Customers', align: 'right' },
              { key: 'created_at', label: 'Created', render: (s) => new Date(s.created_at).toLocaleDateString() },
            ]}
            rows={shops}
          />
        </div>

        <div className="card">
          <h3>Users</h3>
          <DataTable empty="No users yet." columns={userColumns} rows={users} />
        </div>

        <DownloadList title={t('dl.title')} subtitle={t('dl.adminSubtitle')} items={downloadItems} />
      </div>
    </div>
  );
}
