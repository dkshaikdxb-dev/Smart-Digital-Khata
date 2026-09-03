import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../components/Nav';
import DataTable from '../components/DataTable';
import { apiFetch } from '../lib/api';

const fmt = (paise) => `₹${(Number(paise || 0) / 100).toFixed(2)}`;

export default function PlatformAdmin() {
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [shops, setShops] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');

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

  return (
    <div>
      <Nav />
      <div className="container">
        <h1>Platform overview</h1>
        {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}

        <div className="grid">
          <div className="card"><div className="muted">Shops</div><div className="kpi">{stats ? stats.shops : '—'}</div></div>
          <div className="card"><div className="muted">Users</div><div className="kpi">{stats ? stats.users : '—'}</div></div>
          <div className="card"><div className="muted">Transactions</div><div className="kpi">{stats ? stats.transactions : '—'}</div></div>
          <div className="card"><div className="muted">Outstanding (platform)</div><div className="kpi">{stats ? fmt(stats.outstanding_total) : '—'}</div></div>
        </div>

        <div className="card">
          <h3>Shops</h3>
          <DataTable
            empty="No shops yet."
            columns={[
              { key: 'name', label: 'Shop', render: (s) => <strong>{s.name}</strong> },
              { key: 'plan', label: 'Plan', render: (s) => <span className="badge">{s.plan}</span> },
              { key: 'notification_mode', label: 'Notifications' },
              { key: 'customers_count', label: 'Customers', align: 'right' },
              { key: 'created_at', label: 'Created', render: (s) => new Date(s.created_at).toLocaleDateString() },
            ]}
            rows={shops}
          />
        </div>

        <div className="card">
          <h3>Users</h3>
          <DataTable
            empty="No users yet."
            columns={[
              { key: 'name', label: 'Name', render: (u) => <strong>{u.name}</strong> },
              { key: 'email', label: 'Email' },
              { key: 'phone', label: 'Phone' },
              { key: 'role', label: 'Role', render: (u) => <span className="badge">{u.role}</span> },
              { key: 'created_at', label: 'Joined', render: (u) => new Date(u.created_at).toLocaleDateString() },
            ]}
            rows={users}
          />
        </div>
      </div>
    </div>
  );
}
