import { useEffect, useState } from 'react';
import Link from 'next/link';
import CustomerShell, { money, useCustomerGuard } from '../../components/CustomerShell';
import { customerFetch } from '../../lib/customerApi';
import { useLang } from '../../lib/i18n';
import { waitingHintKey } from '../../lib/orderStatus';

const STATUS_LABELS = {
  pending: 'Pending',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function statusBadgeClass(status) {
  if (status === 'cancelled') return 'cpwa-badge-danger';
  if (status === 'completed') return 'cpwa-badge-ok';
  return 'cpwa-badge-warn';
}

export default function Orders() {
  const ready = useCustomerGuard();
  const { t } = useLang();
  const ostatusLabel = (s) => { const v = t(`ostatus.${s}`); return v === `ostatus.${s}` ? (STATUS_LABELS[s] || s) : v; };
  const fulLabel = (s) => { const v = t(`ful.${s}`); return v === `ful.${s}` ? s : v; };
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const r = await customerFetch('/api/my/orders');
        setItems(r.items || r.orders || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [ready]);

  if (!ready) return null;

  return (
    <CustomerShell title={t('c.myOrders')}>
      {error && <div className="card cpwa-error">{error}</div>}
      {loading && <div className="card">{t('c.loadingOrders')}</div>}
      {!loading && !error && items.length === 0 && (
        <div className="card cpwa-empty">
          <div className="cpwa-empty-ico">📦</div>
          <p className="muted">{t('c.noOrders')}</p>
          <Link href="/c/shops"><button>{t('c.browseShops')}</button></Link>
        </div>
      )}

      {items.map((o) => (
        <Link key={o.id} href={`/c/orders/${o.id}`} className="card cpwa-shopcard">
          <div className="cpwa-shopcard-body">
            <div className="cpwa-row-between">
              <span className="cpwa-shopcard-name">{o.shop_name || t('c.shop')}</span>
              <span className={`badge ${statusBadgeClass(o.status)}`}>{ostatusLabel(o.status)}</span>
            </div>
            <div className="cpwa-order-next">{t(waitingHintKey(o))}</div>
            <div className="muted">
              {new Date(o.created_at).toLocaleString()} · {o.item_count != null ? t('common.itemCount', { n: o.item_count, s: o.item_count > 1 ? 's' : '' }) : ''}
            </div>
            <div className="cpwa-shopcard-meta">
              <span>{money(o.subtotal)}</span>
              <span className="badge">{fulLabel(o.fulfillment_type)}</span>
              <span className="badge">{o.payment_mode === 'prepaid' ? t('c.prepaid') : t('c.credit')}</span>
            </div>
          </div>
          <span className="cpwa-chev">›</span>
        </Link>
      ))}
    </CustomerShell>
  );
}
