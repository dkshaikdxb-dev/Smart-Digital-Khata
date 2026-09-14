import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { money as fmt } from '../../lib/money';
import { friendlyError, logForSupport } from '../../lib/errorText';
import { useLangFor, isRtl } from '../../lib/i18n';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// The post-payment "thank you" page. Razorpay redirects the customer's browser
// here, so it is the last thing they see after handing over money — and it was
// hardcoded English. Every line goes through t() now, in the language the
// PAYING CUSTOMER has on file (returned by the public order endpoint), falling
// back to this browser's choice when they have never picked one.
export default function PayLanding() {
  const router = useRouter();
  const { orderId } = router.query;
  const [order, setOrder] = useState(null);
  // The failure is held as the error OBJECT, not as a sentence: the language
  // this page renders in arrives in the response we are still waiting for, so a
  // sentence built here would be pinned to the wrong language. It becomes copy
  // at render, with the language-aware t().
  const [err, setErr] = useState(null);
  const { lang, t } = useLangFor(order && order.language);

  useEffect(() => {
    if (!orderId) return;
    fetch(`${API}/api/payments/orders/${orderId}/public`)
      .then((r) => r.json())
      .then((d) => {
        if (!d || !d.order) {
          const missing = new Error('order not found');
          missing.messageKey = 'pub.pay.notFound';
          throw missing;
        }
        setOrder(d.order);
      })
      .catch((e) => { logForSupport(e, 'public payment landing'); setErr(e); });
  }, [orderId]);

  const dir = isRtl(lang) ? 'rtl' : 'ltr';

  if (err) {
    return (
      <Center>
        <div className="card" dir={dir}><h2>{friendlyError(t, err)}</h2></div>
      </Center>
    );
  }
  if (!order) return <Center><div className="card">{t('common.loading')}</div></Center>;

  const paid = order.status === 'paid';

  return (
    <Center>
      <div className="card" dir={dir} style={{ maxWidth: 420, textAlign: 'center' }}>
        <div style={{ fontSize: 40 }}>{paid ? '✅' : '⏳'}</div>
        <h2>{paid ? t('pub.pay.received') : t('pub.pay.awaiting')}</h2>
        <p className="muted">{order.shop_name}</p>
        <div style={{ fontSize: 28, fontWeight: 700, margin: '12px 0' }}>{fmt(order.amount)}</div>
        <p className="muted">{t('common.customer')}: {order.customer_name}</p>
        {paid && <p className="muted">{t('pub.pay.paidAt', { when: new Date(order.paid_at).toLocaleString() })}</p>}
        {!paid && <p className="muted">{t('pub.pay.refreshHint')}</p>}
      </div>
    </Center>
  );
}

function Center({ children }) {
  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>{children}</div>;
}
