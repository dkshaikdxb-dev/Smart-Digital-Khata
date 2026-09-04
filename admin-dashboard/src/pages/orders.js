import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../components/Nav';
import DataTable from '../components/DataTable';
import { apiFetch } from '../lib/api';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;

const STATUSES = ['pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'];
const label = (s) => (s || '').replace(/_/g, ' ');

const statusColor = (s) => {
  if (s === 'completed') return 'var(--accent)';
  if (s === 'cancelled') return 'var(--danger)';
  return 'var(--text)';
};
const payColor = (s) => {
  if (s === 'paid') return 'var(--accent)';
  if (s === 'failed') return 'var(--danger)';
  return 'var(--muted)';
};

export default function Orders() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('all');
  const [error, setError] = useState('');

  async function load(s) {
    const st = s === undefined ? status : s;
    const qs = st && st !== 'all' ? `?status=${encodeURIComponent(st)}` : '';
    const r = await apiFetch(`/api/orders${qs}`);
    setItems(r.items || r.orders || []);
  }

  useEffect(() => {
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') === 'admin') { router.replace('/admin'); return; }
    load('all').catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pick(s) {
    setStatus(s);
    setError('');
    load(s).catch((e) => setError(e.message));
  }

  const open = (o) => router.push(`/orders/${o.id}`);

  const columns = [
    { key: 'created_at', label: 'When', render: (o) => new Date(o.created_at).toLocaleString() },
    { key: 'customer', label: 'Customer', render: (o) => (
      <><strong>{o.customer_name || '—'}</strong>{o.customer_phone ? <div className="muted">{o.customer_phone}</div> : null}</>
    ) },
    { key: 'fulfillment_type', label: 'Fulfillment', render: (o) => <span className="badge">{label(o.fulfillment_type)}</span> },
    { key: 'payment_mode', label: 'Payment', render: (o) => (
      <><span className="badge">{o.payment_mode}</span>{' '}
        <span className="badge" style={{ color: payColor(o.payment_status) }}>{label(o.payment_status)}</span></>
    ) },
    { key: 'subtotal', label: 'Total', align: 'right', render: (o) => fmt(o.subtotal) },
    { key: 'status', label: 'Status', render: (o) => (
      <span className="badge" style={{ color: statusColor(o.status) }}>{label(o.status)}</span>
    ) },
  ];

  return (
    <div>
      <Nav />
      <div className="container">
        <h1>Orders</h1>

        <div className="card">
          <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
            <button className={status === 'all' ? '' : 'secondary'} onClick={() => pick('all')}>All</button>
            {STATUSES.map((s) => (
              <button key={s} className={status === s ? '' : 'secondary'} onClick={() => pick(s)}>{label(s)}</button>
            ))}
          </div>
          {error && <div style={{ color: 'var(--danger)', marginTop: 12 }}>{error}</div>}
        </div>

        <div className="card">
          <DataTable columns={columns} rows={items} onRowClick={open} empty="No orders in this view yet." />
        </div>
      </div>
    </div>
  );
}
