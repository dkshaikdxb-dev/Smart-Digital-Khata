import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../components/Nav';
import DataTable from '../components/DataTable';
import { apiFetch } from '../lib/api';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;

export default function Customers() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', credit_limit: 0 });
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

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
        body: JSON.stringify({ ...form, credit_limit: Math.round(Number(form.credit_limit) * 100) }),
      });
      setForm({ name: '', phone: '', credit_limit: 0 });
      await load();
    } catch (err) { setError(err.message); }
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
      const r = await apiFetch(`/api/customers/${c.id}/share-link`, { method: 'POST', body: JSON.stringify({ send: true }) });
      window.prompt(r.sent ? 'Khata link sent on WhatsApp. Copy if needed:' : 'Khata link (copy and share):', r.link);
    } catch (err) { setError(err.message); }
  }

  async function remindAll() {
    setError(''); setMsg('');
    if (!window.confirm('Send a WhatsApp reminder to every customer who owes money?')) return;
    try {
      const r = await apiFetch('/api/notifications/broadcast', { method: 'POST', body: JSON.stringify({ mode: 'outstanding' }) });
      setMsg(`Reminders sent to ${r.sent} customer${r.sent === 1 ? '' : 's'}.`);
    } catch (err) { setError(err.message); }
  }

  const open = (c) => router.push(`/customers/${c.id}`);

  const columns = [
    { key: 'name', label: 'Name', render: (c) => <strong>{c.name}</strong> },
    { key: 'phone', label: 'Phone' },
    { key: 'credit_limit', label: 'Credit limit', render: (c) => (Number(c.credit_limit) > 0 ? fmt(c.credit_limit) : '—') },
    { key: 'balance', label: 'Balance', render: (c) => <span style={{ color: Number(c.balance) > 0 ? 'var(--danger)' : 'var(--muted)' }}>{fmt(c.balance)}</span> },
    {
      key: 'alerts', label: 'Alerts', render: (c) => (
        <button className="secondary" onClick={(e) => { e.stopPropagation(); toggleNotifications(c); }}
          title={c.notifications_enabled !== false ? 'Alerts on — tap to mute' : 'Muted — tap to enable'}>
          {c.notifications_enabled !== false ? '🔔 On' : '🔕 Off'}
        </button>
      ),
    },
    {
      key: 'actions', label: 'Actions', align: 'right', render: (c) => (
        <span className="row-actions">
          <button className="secondary" onClick={(e) => { e.stopPropagation(); open(c); }}>Open</button>
          <button className="secondary" onClick={(e) => { e.stopPropagation(); shareKhata(c); }}>Share</button>
        </span>
      ),
    },
  ];

  return (
    <div>
      <Nav />
      <div className="container">
        <h1>Customers</h1>

        <div className="card">
          <h3>Add customer</h3>
          <form onSubmit={create} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr auto', gap: 10 }}>
            <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input placeholder="Phone (+91…)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
            <input placeholder="Credit limit ₹" type="number" min="0" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} />
            <button>Add</button>
          </form>
        </div>

        <div className="card">
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <input placeholder="Search by name or phone…" value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') load(); }} style={{ flex: 1, minWidth: 180 }} />
            <button className="secondary" onClick={() => load()}>Search</button>
            <button onClick={remindAll} title="WhatsApp reminder to all customers with dues">Remind all dues</button>
          </div>
          {msg && <div className="muted" style={{ marginBottom: 10 }}>{msg}</div>}
          {error && <div style={{ color: 'var(--danger)', marginBottom: 10 }}>{error}</div>}
          <DataTable columns={columns} rows={items} onRowClick={open} empty="No customers yet. Add your first above." />
        </div>
      </div>
    </div>
  );
}
