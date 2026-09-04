import { useEffect, useState } from 'react';
import CustomerShell, { money, useCustomerGuard } from '../../components/CustomerShell';
import { customerFetch } from '../../lib/customerApi';
import { useLang } from '../../lib/i18n';

// My khata: cross-shop outstanding balances with a per-shop "Pay" that opens
// the Razorpay link returned by POST /api/my/pay.
export default function Khata() {
  const ready = useCustomerGuard();
  const { t } = useLang();
  const [total, setTotal] = useState(0);
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState('');

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const r = await customerFetch('/api/my/khata');
        setTotal(Number(r.total_outstanding || 0));
        setShops(r.shops || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [ready]);

  async function pay(shop) {
    setError('');
    setPaying(shop.shop_id);
    try {
      const r = await customerFetch('/api/my/pay', {
        method: 'POST',
        body: JSON.stringify({ shop_id: shop.shop_id, amount: Number(shop.balance) }),
      });
      const link = r.link || r.pay_link;
      if (link) {
        window.location.href = link;
        return;
      }
      throw new Error(t('c.payStartFailed'));
    } catch (err) {
      setError(err.message);
      setPaying('');
    }
  }

  if (!ready) return null;

  return (
    <CustomerShell title={t('c.myKhata')}>
      {error && <div className="card cpwa-error">{error}</div>}
      {loading && <div className="card">{t('c.loadingKhata')}</div>}

      {!loading && !error && (
        <div className="card cpwa-hero">
          <div className="muted">{t('common.totalOutstanding')}</div>
          <div className="kpi" style={{ color: total > 0 ? 'var(--danger)' : 'var(--accent)' }}>{money(total)}</div>
        </div>
      )}

      {!loading && !error && shops.length === 0 && (
        <div className="card muted">{t('c.noKhata')}</div>
      )}

      {shops.map((s) => {
        const owes = Number(s.balance) > 0;
        return (
          <div key={s.shop_id} className="card">
            <div className="cpwa-row-between">
              <div>
                <div className="cpwa-shopcard-name">{s.shop_name}</div>
                <div className="muted">
                  {t('common.balance')} {money(s.balance)}
                  {s.credit_limit != null && Number(s.credit_limit) > 0 ? t('c.limitSuffix', { amt: money(s.credit_limit) }) : ''}
                </div>
              </div>
              <button type="button" onClick={() => pay(s)} disabled={!owes || paying === s.shop_id}>
                {paying === s.shop_id ? t('c.opening') : t('c.pay')}
              </button>
            </div>
          </div>
        );
      })}
    </CustomerShell>
  );
}
