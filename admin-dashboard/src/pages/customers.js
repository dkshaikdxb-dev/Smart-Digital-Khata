import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../components/Nav';
import { apiFetch } from '../lib/api';

export default function Customers() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', credit_limit: 0 });
  const [error, setError] = useState('');

  async function load() {
    const r = await apiFetch(`/api/customers?search=${encodeURIComponent(search)}`);
    setItems(r.items);
  }

  useEffect(() => {
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') === 'admin') { router.replace('/admin'); return; }
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      await apiFetch('/api/customers', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          credit_limit: Math.round(Number(form.credit_limit) * 100),
        }),
      });
      setForm({ name: '', phone: '', credit_limit: 0 });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleNotifications(c) {
    setError('');
    try {
      await apiFetch(`/api/customers/${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ notifications_enabled: !(c.notifications_enabled !== false) }),
      });
      await load();
    } catch (err) { setError(err.message); }
  }

  async function shareKhata(c) {
    setError('');
    try {
      const r = await apiFetch(`/api/customers/${c.id}/share-link`, {
        method: 'POST',
        body: JSON.stringify({ send: true }),
      });
      window.prompt(
        r.sent ? 'Khata link sent on WhatsApp. Copy if needed:' : 'Khata link (copy and share):',
        r.link
      );
    } catch (err) { setError(err.message); }
  }

  const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;

  return (
    <div>
      <Nav />
      <div className="container">
        <h1>Customers</h1>

        <div className="card">
          <form onSubmit={create} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr auto', gap: 10 }}>
            <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
            <input placeholder="Credit limit (₹)" type="number" min="0" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} />
            <button>Add</button>
          </form>
          {error && <div style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
        </div>

        <div className="card">
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <input placeholder="Search by name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="secondary" onClick={() => load()}>Search</button>
          </div>
          <table>
            <thead>
              <tr><th>Name</th><th>Phone</th><th>Credit limit</th><th>Balance</th><th>Alerts</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.phone}</td>
                  <td>{fmt(c.credit_limit)}</td>
                  <td>{fmt(c.balance)}</td>
                  <td>
                    <button
                      className="secondary"
                      title={c.notifications_enabled !== false ? 'WhatsApp alerts on — click to mute' : 'Muted — click to enable'}
                      onClick={() => toggleNotifications(c)}
                    >
                      {c.notifications_enabled !== false ? '🔔 On' : '🔕 Off'}
                    </button>
                  </td>
                  <td>
                    <button className="secondary" title="Send read-only khata link on WhatsApp" onClick={() => shareKhata(c)}>
                      Share khata
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
