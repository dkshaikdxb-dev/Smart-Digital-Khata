import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../components/Nav';
import { apiFetch } from '../lib/api';

export default function Transactions() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({ customer_id: '', type: 'purchase', amount: '', note: '' });
  const [request, setRequest] = useState({ customer_id: '', amount: '', note: '' });
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function load() {
    const [tx, c] = await Promise.all([
      apiFetch('/api/transactions'),
      apiFetch('/api/customers'),
    ]);
    setItems(tx.items);
    setCustomers(c.items);
  }

  useEffect(() => {
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
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
          <h3>Recent</h3>
          <table>
            <thead>
              <tr><th>When</th><th>Type</th><th>Method</th><th>Amount</th><th>Note</th></tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td>{new Date(t.created_at).toLocaleString()}</td>
                  <td><span className="badge">{t.type}</span></td>
                  <td>{t.method}</td>
                  <td>{fmt(t.amount)}</td>
                  <td>{t.note || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
