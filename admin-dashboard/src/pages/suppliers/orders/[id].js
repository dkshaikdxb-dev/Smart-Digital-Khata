import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../../../components/Nav';
import DataTable from '../../../components/DataTable';
import { apiFetch } from '../../../lib/api';
import { useLang } from '../../../lib/i18n';
import { PO_PIPELINE, PO_TERMINAL, poStepIndex, poCanCancel } from '../../../lib/orderStatus';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;

export default function SupplierOrderDetail() {
  const router = useRouter();
  const { t } = useLang();
  const { id } = router.query;
  const [po, setPo] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await apiFetch(`/api/purchase-orders/${id}`);
    setPo(r.purchase_order || r);
  }, [id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') === 'admin') { router.replace('/admin'); return; }
    if (window.localStorage.getItem('skhata_role') === 'distributor') { router.replace('/distributor'); return; }
    if (id) load().catch((e) => setError(e.message));
  }, [id, load, router]);

  async function cancel() {
    if (!window.confirm(t('sup.cancelConfirm'))) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/purchase-orders/${id}/cancel`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <Shell><div className="card" style={{ color: 'var(--danger)' }}>{error}</div></Shell>;
  if (!po) return <Shell><div className="card">{t('common.loading')}</div></Shell>;

  const cancelled = po.status === 'cancelled';
  const terminal = PO_TERMINAL.has(po.status);
  const currentIdx = poStepIndex(po.status);
  const items = po.items || [];
  // The distributor hasn't priced yet until the order leaves 'placed'.
  const priced = po.status !== 'placed';

  return (
    <Shell>
      <button className="secondary" onClick={() => router.push('/suppliers/orders')} style={{ marginBottom: 12 }}>← {t('sup.orderBack')}</button>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: '0 0 2px' }}>{po.distributor_name}</h2>
            <div className="muted">{t('sup.supplier')}</div>
            <div className="muted">{new Date(po.created_at).toLocaleString()}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="kpi">{fmt(po.subtotal_paise)}</div>
            <span className="badge" style={{ color: cancelled ? 'var(--danger)' : (po.status === 'delivered' ? 'var(--accent)' : 'var(--text)') }}>
              {t(`postatus.${po.status}`)}
            </span>
          </div>
        </div>

        {!cancelled && (
          <div className="ord-stepper" style={{ marginTop: 16 }}>
            {PO_PIPELINE.map((s, i) => (
              <span key={s} className={`ord-stepper-node ${i < currentIdx ? 'done' : ''} ${i === currentIdx ? 'current' : ''}`}>
                {t(`postatus.${s}`)}
              </span>
            ))}
          </div>
        )}

        <div className="muted" style={{ marginTop: 12 }}>{t(`sup.waiting.${po.status}`)}</div>

        {poCanCancel(po.status) && (
          <div className="row-actions" style={{ justifyContent: 'flex-start', marginTop: 16 }}>
            <button className="secondary" onClick={cancel} disabled={busy}>{t('sup.cancelOrder')}</button>
          </div>
        )}
        {terminal && cancelled && <div className="muted" style={{ marginTop: 10 }}>{t('sup.cancelled')}</div>}
        {po.note && <div style={{ marginTop: 12 }}><span className="muted">{t('common.note')}: </span>{po.note}</div>}
      </div>

      <div className="card">
        <h3>{t('common.items')}</h3>
        {!priced && <p className="muted" style={{ marginTop: 0 }}>{t('sup.pricesPending')}</p>}
        <DataTable
          empty={t('sup.ordersEmpty')}
          columns={[
            { key: 'name', label: t('sup.itemName'), render: (it) => (
              <span><strong>{it.name}</strong>{[it.brand, it.pack].filter(Boolean).length ? <span className="muted"> · {[it.brand, it.pack].filter(Boolean).join(' · ')}</span> : null}</span>
            ) },
            { key: 'qty', label: t('sup.qty'), align: 'right', render: (it) => it.qty },
            { key: 'unit_price', label: t('sup.unitPrice'), align: 'right', render: (it) => (Number(it.unit_price_paise) > 0 ? fmt(it.unit_price_paise) : '—') },
            { key: 'line_total', label: t('sup.lineTotal'), align: 'right', render: (it) => (Number(it.line_total_paise) > 0 ? fmt(it.line_total_paise) : '—') },
          ]}
          rows={items}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, fontWeight: 700 }}>
          <span style={{ marginRight: 12 }} className="muted">{t('common.subtotal')}</span>
          <span>{fmt(po.subtotal_paise)}</span>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return (<div><Nav /><div className="container">{children}</div></div>);
}
