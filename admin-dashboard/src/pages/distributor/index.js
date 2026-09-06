import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import DistNav from '../../components/DistNav';
import { apiFetch } from '../../lib/api';
import { useLang } from '../../lib/i18n';

const PO_STATUSES = ['placed', 'confirmed', 'dispatched', 'delivered', 'cancelled'];

const statusColor = (s) => {
  if (s === 'delivered') return 'var(--accent)';
  if (s === 'cancelled') return 'var(--danger)';
  return 'var(--text)';
};

// Guard: distributors only. Owners/staff go to /dashboard, admins to /admin.
function guard(router) {
  if (typeof window === 'undefined') return false;
  if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return false; }
  const role = window.localStorage.getItem('skhata_role');
  if (role === 'admin') { router.replace('/admin'); return false; }
  if (role !== 'distributor') { router.replace('/dashboard'); return false; }
  return true;
}

export default function DistributorHome() {
  const router = useRouter();
  const { t } = useLang();
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load(s) {
    const st = s === undefined ? status : s;
    setLoading(true);
    setError('');
    try {
      const qs = st && st !== 'all' ? `?status=${encodeURIComponent(st)}` : '';
      const r = await apiFetch(`/api/distributor/orders${qs}`);
      setOrders(r.orders || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!guard(router)) return;
    load('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pick(s) {
    setStatus(s);
    load(s);
  }

  return (
    <div>
      <DistNav />
      <div className="container">
        <h1>{t('dist.title')}</h1>
        <p className="muted" style={{ marginTop: -6 }}>{t('dist.subtitle')}</p>

        <div className="card">
          <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
            <button className={status === 'all' ? '' : 'secondary'} onClick={() => pick('all')}>{t('status.all')}</button>
            {PO_STATUSES.map((s) => (
              <button key={s} className={status === s ? '' : 'secondary'} onClick={() => pick(s)}>{t(`postatus.${s}`)}</button>
            ))}
          </div>
          {error && <div style={{ color: 'var(--danger)', marginTop: 12 }}>{error}</div>}
        </div>

        {loading ? (
          <div className="card">{t('common.loading')}</div>
        ) : orders.length === 0 ? (
          <div className="card">{t('dist.empty')}</div>
        ) : (
          orders.map((o) => (
            <div
              key={o.id}
              className="card dist-po-row"
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/distributor/orders/${o.id}`)}
              onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/distributor/orders/${o.id}`); }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <strong>{o.shop_name}</strong>
                  <div className="muted">
                    {t('dist.itemsN', { n: o.item_count, s: Number(o.item_count) === 1 ? '' : 's' })} · {t('dist.placedOn', { when: new Date(o.created_at).toLocaleDateString() })}
                  </div>
                </div>
                <span className="badge" style={{ color: statusColor(o.status), height: 'fit-content' }}>{t(`postatus.${o.status}`)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      <style jsx>{`
        .dist-po-row { cursor: pointer; }
        .dist-po-row:hover { outline: 1px solid var(--accent); }
      `}</style>
    </div>
  );
}
