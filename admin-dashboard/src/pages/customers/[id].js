import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import DataTable from '../../components/DataTable';
import { apiFetch } from '../../lib/api';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;

export default function CustomerDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [edit, setEdit] = useState(null);
  const [tx, setTx] = useState({ type: 'purchase', amount: '', note: '' });

  const load = useCallback(async () => {
    const r = await apiFetch(`/api/customers/${id}/ledger`);
    setData(r);
    setEdit({
      name: r.customer.name,
      phone: r.customer.phone,
      credit_limit: (Number(r.customer.credit_limit) / 100).toString(),
    });
  }, [id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') === 'admin') { router.replace('/admin'); return; }
    if (id) load().catch((e) => setError(e.message));
  }, [id, load, router]);

  if (error) return <Shell><div className="card" style={{ color: 'var(--danger)' }}>{error}</div></Shell>;
  if (!data) return <Shell><div className="card">Loading…</div></Shell>;

  const c = data.customer;

  async function recordTx(e) {
    e.preventDefault(); setMsg(''); setError('');
    try {
      await apiFetch('/api/transactions', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: id,
          type: tx.type,
          amount: Math.round(Number(tx.amount) * 100),
          method: tx.type === 'purchase' ? 'credit' : tx.type,
          note: tx.note || null,
        }),
      });
      setTx({ type: 'purchase', amount: '', note: '' });
      await load();
      setMsg('Saved.');
    } catch (err) { setError(err.message); }
  }

  async function saveEdit(e) {
    e.preventDefault(); setMsg(''); setError('');
    try {
      await apiFetch(`/api/customers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: edit.name,
          phone: edit.phone,
          credit_limit: Math.round(Number(edit.credit_limit) * 100),
        }),
      });
      await load();
      setMsg('Customer updated.');
    } catch (err) { setError(err.message); }
  }

  async function remind() {
    setMsg(''); setError('');
    try {
      await apiFetch(`/api/notifications/remind/${id}`, { method: 'POST' });
      setMsg('Reminder sent on WhatsApp.');
    } catch (err) { setError(err.message); }
  }

  async function share() {
    setMsg(''); setError('');
    try {
      const r = await apiFetch(`/api/customers/${id}/share-link`, { method: 'POST', body: JSON.stringify({ send: true }) });
      window.prompt(r.sent ? 'Khata link sent on WhatsApp. Copy if needed:' : 'Khata link:', r.link);
    } catch (err) { setError(err.message); }
  }

  async function archive() {
    if (!window.confirm(`Archive ${c.name}? They will be hidden from lists.`)) return;
    try {
      await apiFetch(`/api/customers/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'archived' }) });
      router.push('/customers');
    } catch (err) { setError(err.message); }
  }

  return (
    <Shell>
      <button className="secondary" onClick={() => router.push('/customers')} style={{ marginBottom: 12 }}>← Customers</button>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: '0 0 2px' }}>{c.name}</h2>
            <div className="muted">{c.phone}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="muted">Outstanding</div>
            <div className="kpi" style={{ color: Number(c.balance) > 0 ? 'var(--danger)' : 'var(--accent)' }}>{fmt(c.balance)}</div>
            <div className="muted">Limit {Number(c.credit_limit) > 0 ? fmt(c.credit_limit) : 'none'}</div>
          </div>
        </div>
        <div className="row-actions" style={{ justifyContent: 'flex-start', marginTop: 14 }}>
          <button onClick={remind} disabled={Number(c.balance) <= 0}>Send reminder</button>
          <button className="secondary" onClick={share}>Share khata</button>
          <button className="secondary" onClick={archive}>Archive</button>
        </div>
        {msg && <div className="muted" style={{ marginTop: 10 }}>{msg}</div>}
        {error && <div style={{ color: 'var(--danger)', marginTop: 10 }}>{error}</div>}
      </div>

      <div className="card">
        <h3>Record transaction</h3>
        <form onSubmit={recordTx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr auto', gap: 10 }}>
          <select value={tx.type} onChange={(e) => setTx({ ...tx, type: e.target.value })}>
            <option value="purchase">Purchase</option>
            <option value="cash">Cash payment</option>
            <option value="upi">UPI payment</option>
          </select>
          <input type="number" placeholder="Amount (₹)" value={tx.amount} onChange={(e) => setTx({ ...tx, amount: e.target.value })} required />
          <input placeholder="Note (optional)" value={tx.note} onChange={(e) => setTx({ ...tx, note: e.target.value })} />
          <button>Save</button>
        </form>
      </div>

      <div className="card">
        <h3>Ledger</h3>
        <DataTable
          empty="No transactions yet."
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
          rows={data.transactions}
        />
      </div>

      <div className="card">
        <h3>Edit customer</h3>
        <form onSubmit={saveEdit} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr auto', gap: 10 }}>
          <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required />
          <input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} required />
          <input type="number" value={edit.credit_limit} onChange={(e) => setEdit({ ...edit, credit_limit: e.target.value })} placeholder="Limit ₹" />
          <button>Save</button>
        </form>
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return (<div><Nav /><div className="container">{children}</div></div>);
}
