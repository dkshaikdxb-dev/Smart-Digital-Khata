import { useEffect, useState } from 'react';
import Link from 'next/link';
import CustomerShell, { money, useCustomerGuard } from '../../components/CustomerShell';
import { customerFetch } from '../../lib/customerApi';

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
    <CustomerShell title="My orders">
      {error && <div className="card cpwa-error">{error}</div>}
      {loading && <div className="card">Loading orders…</div>}
      {!loading && !error && items.length === 0 && (
        <div className="card cpwa-empty">
          <div className="cpwa-empty-ico">📦</div>
          <p className="muted">No orders yet.</p>
          <Link href="/c/shops"><button>Browse shops</button></Link>
        </div>
      )}

      {items.map((o) => (
        <Link key={o.id} href={`/c/orders/${o.id}`} className="card cpwa-shopcard">
          <div className="cpwa-shopcard-body">
            <div className="cpwa-row-between">
              <span className="cpwa-shopcard-name">{o.shop_name || 'Shop'}</span>
              <span className={`badge ${statusBadgeClass(o.status)}`}>{STATUS_LABELS[o.status] || o.status}</span>
            </div>
            <div className="muted">
              {new Date(o.created_at).toLocaleString()} · {o.item_count != null ? `${o.item_count} item${o.item_count > 1 ? 's' : ''}` : ''}
            </div>
            <div className="cpwa-shopcard-meta">
              <span>{money(o.subtotal)}</span>
              <span className="badge">{o.fulfillment_type}</span>
              <span className="badge">{o.payment_mode === 'prepaid' ? 'Prepaid' : 'Credit'}</span>
            </div>
          </div>
          <span className="cpwa-chev">›</span>
        </Link>
      ))}
    </CustomerShell>
  );
}
