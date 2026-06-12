import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function PayLanding() {
  const router = useRouter();
  const { orderId } = router.query;
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!orderId) return;
    fetch(`${API}/api/payments/orders/${orderId}/public`)
      .then((r) => r.json())
      .then((d) => setOrder(d.order))
      .catch((e) => setError(e.message));
  }, [orderId]);

  if (error) return <Center><div className="card"><h2>Order not found</h2><p className="muted">{error}</p></div></Center>;
  if (!order) return <Center><div className="card">Loading…</div></Center>;

  const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;
  const paid = order.status === 'paid';

  return (
    <Center>
      <div className="card" style={{ maxWidth: 420, textAlign: 'center' }}>
        <div style={{ fontSize: 40 }}>{paid ? '✅' : '⏳'}</div>
        <h2>{paid ? 'Payment received' : 'Awaiting payment'}</h2>
        <p className="muted">{order.shop_name}</p>
        <div style={{ fontSize: 28, fontWeight: 700, margin: '12px 0' }}>{fmt(order.amount)}</div>
        <p className="muted">Customer: {order.customer_name}</p>
        {paid && <p className="muted">Paid at {new Date(order.paid_at).toLocaleString()}</p>}
        {!paid && <p className="muted">If you paid moments ago, please refresh in a few seconds.</p>}
      </div>
    </Center>
  );
}

function Center({ children }) {
  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>{children}</div>;
}
