import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../components/Nav';
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
          <table>
            <thead>
              <tr><th>Shop</th><th>Plan</th><th>Notifications</th><th>Customers</th><th>Created</th></tr>
            </thead>
            <tbody>
              {shops.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td><span className="badge">{s.plan}</span></td>
                  <td>{s.notification_mode}</td>
                  <td>{s.customers_count}</td>
                  <td>{new Date(s.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Users</h3>
          <table>
            <thead>
              <tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Joined</th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.phone}</td>
                  <td><span className="badge">{u.role}</span></td>
                  <td>{new Date(u.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
