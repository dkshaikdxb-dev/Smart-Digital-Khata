import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import CustomerShell, { money, useCustomerGuard } from '../../../components/CustomerShell';
import { customerFetch } from '../../../lib/customerApi';

// Happy-path status flow used to render the timeline. `cancelled` is terminal
// and shown separately. The backend currently sets pending/cancelled; the rest
// are anticipated as shops progress an order.
const FLOW = ['pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'completed'];
const LABELS = {
  pending: 'Pending',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export default function OrderDetail() {
  const guardReady = useCustomerGuard();
  const router = useRouter();
  const { id } = router.query;
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);

  async function load() {
    try {
      const r = await customerFetch(`/api/my/orders/${id}`);
      setOrder(r.order || r);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!guardReady || !id) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guardReady, id]);

  async function cancelOrder() {
    if (!window.confirm('Cancel this order?')) return;
    setCancelling(true);
    setError('');
    try {
      const r = await customerFetch(`/api/my/orders/${id}/cancel`, { method: 'POST' });
      setOrder(r.order || r);
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  }

  if (!guardReady) return null;

  const cancellable = order && order.status === 'pending';
  const isCancelled = order && order.status === 'cancelled';
  const currentIdx = order ? FLOW.indexOf(order.status) : -1;

  return (
    <CustomerShell title="Order" back="/c/orders">
      {error && <div className="card cpwa-error">{error}</div>}
      {loading && <div className="card">Loading order…</div>}

      {order && (
        <>
          <div className="card">
            <div className="cpwa-row-between">
              <strong>{order.shop_name || 'Shop'}</strong>
              <span className={`badge ${isCancelled ? 'cpwa-badge-danger' : order.status === 'completed' ? 'cpwa-badge-ok' : 'cpwa-badge-warn'}`}>
                {LABELS[order.status] || order.status}
              </span>
            </div>
            <div className="muted" style={{ marginTop: 4 }}>{new Date(order.created_at).toLocaleString()}</div>
            <div className="cpwa-shopcard-meta" style={{ marginTop: 8 }}>
              <span className="badge">{order.fulfillment_type}</span>
              <span className="badge">{order.payment_mode === 'prepaid' ? 'Prepaid' : 'Credit'}</span>
              <span className="badge">Payment: {order.payment_status}</span>
            </div>
            {order.address && <div className="muted" style={{ marginTop: 8 }}>Deliver to: {order.address}</div>}
            {order.note && <div className="muted" style={{ marginTop: 4 }}>Note: {order.note}</div>}
          </div>

          <div className="card">
            <div className="cpwa-label">Status</div>
            {isCancelled ? (
              <div className="cpwa-timeline">
                <div className="cpwa-tl-step done cancelled">
                  <span className="cpwa-tl-dot" />
                  <span>Cancelled</span>
                </div>
              </div>
            ) : (
              <div className="cpwa-timeline">
                {FLOW.map((s, i) => (
                  <div key={s} className={`cpwa-tl-step ${i <= currentIdx ? 'done' : ''} ${i === currentIdx ? 'current' : ''}`}>
                    <span className="cpwa-tl-dot" />
                    <span>{LABELS[s]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="cpwa-label">Items</div>
            {(order.items || []).map((it) => (
              <div key={it.id || it.product_id} className="cpwa-cart-line">
                <div className="cpwa-cart-line-info">
                  <div>{it.name}</div>
                  <div className="muted">{money(it.unit_price)} × {it.quantity}</div>
                </div>
                <div className="cpwa-cart-line-total">{money(it.line_total != null ? it.line_total : it.unit_price * it.quantity)}</div>
              </div>
            ))}
            <div className="cpwa-row-between cpwa-subtotal">
              <strong>Total</strong>
              <strong>{money(order.subtotal)}</strong>
            </div>
          </div>

          {cancellable && (
            <button type="button" className="cpwa-btn-danger" onClick={cancelOrder} disabled={cancelling}>
              {cancelling ? 'Cancelling…' : 'Cancel order'}
            </button>
          )}
        </>
      )}
    </CustomerShell>
  );
}
