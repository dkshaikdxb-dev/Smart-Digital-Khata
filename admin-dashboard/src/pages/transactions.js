import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../components/Nav';
import DataTable from '../components/DataTable';
import { apiFetch } from '../lib/api';

export default function Transactions() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({ customer_id: '', type: 'purchase', amount: '', note: '' });
  const [request, setRequest] = useState({ customer_id: '', amount: '', note: '' });
  const [filter, setFilter] = useState({ customer_id: '', type: '' });
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function load() {
    const qs = new URLSearchParams();
    if (filter.customer_id) qs.set('customer_id', filter.customer_id);
    if (filter.type) qs.set('type', filter.type);
    const [tx, c] = await Promise.all([
      apiFetch(`/api/transactions?${qs.toString()}`),
      apiFetch('/api/customers'),
    ]);
    setItems(tx.items);
    setCustomers(c.items);
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
      await apiFetch('/api/transactions', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: form.customer_id,
          type: form.type,
          amount: Math.round(Number(form.amount) * 100),
          method: form.type === 'purchase' ? 'credit' : form.type,
          note: form.note || null,
        }),
      });
      setForm({ customer_id: form.customer_id, type: 'purchase', amount: '', note: '' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function requestPayment(e) {
    e.preventDefault();
    setError(''); setInfo('');
    try {
      const order = await apiFetch('/api/payments/orders', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: request.customer_id,
          amount: Math.round(Number(request.amount) * 100),
          note: request.note || null,
        }),
      });
      const shared = await apiFetch(`/api/payments/orders/${order.order.id}/share`, { method: 'POST' });
      setInfo(`Payment link sent on WhatsApp: ${shared.link}`);
      setRequest({ customer_id: request.customer_id, amount: '', note: '' });
    } catch (err) {
      setError(err.message);
    }
  }

  const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;

  return (
    <div>
      <Nav />
      <div className="container">
        <h1>Transactions</h1>

        <div className="card">
          <h3>Record transaction</h3>
          <form onSubmit={create} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr auto', gap: 10 }}>
            <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} required>
              <option value="">Select customer</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
            </select>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="purchase">Purchase</option>
              <option value="cash">Cash payment</option>
              <option value="upi">UPI payment</option>
            </select>
            <input type="number" placeholder="Amount (₹)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            <input placeholder="Note (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            <button>Save</button>
          </form>
        </div>

        <div className="card">
          <h3>Request payment via WhatsApp</h3>
          <p className="muted">Creates a Razorpay-hosted payment link and sends it to the customer.</p>
          <form onSubmit={requestPayment} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr auto', gap: 10 }}>
            <select value={request.customer_id} onChange={(e) => setRequest({ ...request, customer_id: e.target.value })} required>
              <option value="">Select customer</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
            </select>
            <input type="number" placeholder="Amount (₹)" value={request.amount} onChange={(e) => setRequest({ ...request, amount: e.target.value })} required />
            <input placeholder="Note (e.g. 'July dues')" value={request.note} onChange={(e) => setRequest({ ...request, note: e.target.value })} />
            <button>Send link</button>
          </form>
          {info && <div className="muted" style={{ marginTop: 8 }}>{info}</div>}
          {error && <div style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
        </div>

        <div className="card">
          <h3>History</h3>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <select value={filter.customer_id} onChange={(e) => setFilter({ ...filter, customer_id: e.target.value })} style={{ flex: 1, minWidth: 160 }}>
              <option value="">All customers</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })} style={{ flex: 1, minWidth: 120 }}>
              <option value="">All types</option>
              <option value="purchase">Purchase</option>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
            </select>
            <button className="secondary" onClick={() => load()}>Apply</button>
          </div>
          <DataTable
            empty="No transactions match."
            columns={[
              { key: 'created_at', label: 'When', render: (t) => new Date(t.created_at).toLocaleString() },
              { key: 'type', label: 'Type', render: (t) => <span className="badge">{t.type}</span> },
              { key: 'method', label: 'Method' },
              { key: 'amount', label: 'Amount', align: 'right', render: (t) => (
                <span style={{ color: t.type === 'purchase' ? 'var(--danger)' : 'var(--accent)' }}>
                  {t.type === 'purchase' ? '+' : '−'}{fmt(t.amount)}
                </span>
              ) },
              { key: 'note', label: 'Note', render: (t) => t.note || '' },
            ]}
            rows={items}
          />
        </div>
      </div>
    </div>
  );
}
