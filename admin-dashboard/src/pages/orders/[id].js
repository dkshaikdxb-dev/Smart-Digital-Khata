import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import DataTable from '../../components/DataTable';
import { apiFetch } from '../../lib/api';
import { useLang } from '../../lib/i18n';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;
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

const TERMINAL = ['completed', 'cancelled'];

// Sensible forward transitions given the current status (Cancel is offered separately).
function nextStatuses(order) {
  const isPickup = order.fulfillment_type === 'pickup';
  switch (order.status) {
    case 'pending': return ['accepted'];
    case 'accepted': return ['preparing'];
    case 'preparing': return ['ready'];
    case 'ready': return isPickup ? ['completed'] : ['out_for_delivery'];
    case 'out_for_delivery': return ['completed'];
    default: return [];
  }
}

export default function OrderDetail() {
  const router = useRouter();
  const { t } = useLang();
  const enumLabel = (ns, s) => { const v = t(`${ns}.${s}`); return v === `${ns}.${s}` ? label(s) : v; };
  const { id } = router.query;
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await apiFetch(`/api/orders/${id}`);
    setOrder(r.order || r);
  }, [id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') === 'admin') { router.replace('/admin'); return; }
    if (id) load().catch((e) => setError(e.message));
  }, [id, load, router]);

  if (error) return <Shell><div className="card" style={{ color: 'var(--danger)' }}>{error}</div></Shell>;
  if (!order) return <Shell><div className="card">{t('common.loading')}</div></Shell>;

  async function setStatus(status) {
    setError(''); setMsg(''); setBusy(true);
    try {
      await apiFetch(`/api/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await load();
      setMsg(t('ord.marked', { s: enumLabel('status', status) }));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function cancel() {
    if (!window.confirm(t('ord.cancelConfirm'))) return;
    await setStatus('cancelled');
  }

  const terminal = TERMINAL.includes(order.status);
  const forwards = nextStatuses(order);
  const items = order.items || [];

  return (
    <Shell>
      <button className="secondary" onClick={() => router.push('/orders')} style={{ marginBottom: 12 }}>← {t('nav.orders')}</button>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: '0 0 2px' }}>{order.customer_name || t('ord.order')}</h2>
            {order.customer_phone && <div className="muted">{order.customer_phone}</div>}
            <div className="muted">{new Date(order.created_at).toLocaleString()}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="kpi">{fmt(order.subtotal)}</div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 4 }}>
              <span className="badge">{enumLabel('ful', order.fulfillment_type)}</span>
              <span className="badge">{enumLabel('pmode', order.payment_mode)}</span>
              <span className="badge" style={{ color: payColor(order.payment_status) }}>{enumLabel('pstatus', order.payment_status)}</span>
              <span className="badge" style={{ color: statusColor(order.status) }}>{enumLabel('status', order.status)}</span>
            </div>
          </div>
        </div>

        <div className="row-actions" style={{ justifyContent: 'flex-start', marginTop: 16 }}>
          {forwards.map((s) => (
            <button key={s} onClick={() => setStatus(s)} disabled={busy || terminal}>{t('ord.mark', { s: enumLabel('status', s) })}</button>
          ))}
          <button className="secondary" onClick={cancel} disabled={busy || terminal}>{t('ord.cancelOrder')}</button>
        </div>
        {terminal && <div className="muted" style={{ marginTop: 10 }}>{t('ord.terminal', { s: enumLabel('status', order.status) })}</div>}
        {msg && <div className="muted" style={{ marginTop: 10 }}>{msg}</div>}
        {error && <div style={{ color: 'var(--danger)', marginTop: 10 }}>{error}</div>}
      </div>

      <div className="card">
        <h3>{t('common.items')}</h3>
        <DataTable
          empty={t('ord.emptyItems')}
          columns={[
            { key: 'name', label: t('ord.item'), render: (it) => <strong>{it.name}</strong> },
            { key: 'unit_price', label: t('ord.unitPrice'), align: 'right', render: (it) => fmt(it.unit_price) },
            { key: 'quantity', label: t('common.qty'), align: 'right', render: (it) => it.quantity },
            { key: 'line_total', label: t('common.total'), align: 'right', render: (it) => fmt(it.line_total) },
          ]}
          rows={items}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, fontWeight: 700 }}>
          <span style={{ marginRight: 12 }} className="muted">{t('common.subtotal')}</span>
          <span>{fmt(order.subtotal)}</span>
        </div>
      </div>

      {(order.address || order.note) && (
        <div className="card">
          <h3>{t('ord.delivery')}</h3>
          {order.address && (<><div className="muted">{t('ord.address')}</div><div style={{ marginBottom: 10 }}>{order.address}</div></>)}
          {order.note && (<><div className="muted">{t('common.note')}</div><div>{order.note}</div></>)}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }) {
  return (<div><Nav /><div className="container">{children}</div></div>);
}
