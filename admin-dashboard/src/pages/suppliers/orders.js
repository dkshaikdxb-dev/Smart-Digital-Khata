import { useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import SupplierTabs from '../../components/SupplierTabs';
import ListState from '../../components/ListState';
import { useListLoad } from '../../lib/useListLoad';
import { useLang } from '../../lib/i18n';

const PO_STATUSES = ['placed', 'confirmed', 'dispatched', 'delivered', 'cancelled'];

const statusColor = (s) => {
  if (s === 'delivered') return 'var(--accent)';
  if (s === 'cancelled') return 'var(--danger)';
  return 'var(--text)';
};

export default function SupplierOrders() {
  const router = useRouter();
  const { t } = useLang();
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState('all');

  const statusRef = useRef('all');

  const list = useListLoad(async ({ load: get }) => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') === 'admin') { router.replace('/admin'); return; }
    if (window.localStorage.getItem('skhata_role') === 'distributor') { router.replace('/distributor'); return; }
    const st = statusRef.current;
    const qs = st && st !== 'all' ? `?status=${encodeURIComponent(st)}` : '';
    const r = await get(`/api/purchase-orders${qs}`);
    setOrders(r.purchase_orders || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pick(s) {
    setStatus(s);
    statusRef.current = s;
    list.reload();
  }

  return (
    <div>
      <Nav />
      <div className="container">
        <h1>{t('sup.ordersTitle')}</h1>

        <SupplierTabs active="orders" />

        <div className="card">
          <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
            <button className={status === 'all' ? '' : 'secondary'} onClick={() => pick('all')}>{t('status.all')}</button>
            {PO_STATUSES.map((s) => (
              <button key={s} className={status === s ? '' : 'secondary'} onClick={() => pick(s)}>{t(`postatus.${s}`)}</button>
            ))}
          </div>
        </div>

        {/* Loading, failed and empty used to overlap here: a rejected fetch
            cleared the flag and left an empty list, so "No purchase orders yet"
            sat under the error line. */}
        <ListState state={list}>
        {orders.length === 0 ? (
          <div className="card">{t('sup.ordersEmpty')}</div>
        ) : (
          orders.map((o) => (
            <div
              key={o.id}
              className="card sup-po-row"
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/suppliers/orders/${o.id}`)}
              onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/suppliers/orders/${o.id}`); }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <strong>{o.distributor_name}</strong>
                  <div className="muted">{t('sup.itemsN', { n: o.item_count, s: Number(o.item_count) === 1 ? '' : 's' })} · {t('sup.placedOn', { when: new Date(o.created_at).toLocaleDateString() })}</div>
                  <div className="muted" style={{ marginTop: 4 }}>{t(`sup.waiting.${o.status}`)}</div>
                </div>
                <span className="badge" style={{ color: statusColor(o.status), height: 'fit-content' }}>{t(`postatus.${o.status}`)}</span>
              </div>
            </div>
          ))
        )}
        </ListState>
      </div>

      <style jsx>{`
        .sup-po-row { cursor: pointer; }
        .sup-po-row:hover { outline: 1px solid var(--accent); }
      `}</style>
    </div>
  );
}
