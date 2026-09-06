import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import DistNav from '../../components/DistNav';
import { apiFetch } from '../../lib/api';
import { useLang } from '../../lib/i18n';

// Guard: distributors only. Owners/staff go to /dashboard, admins to /admin.
function guard(router) {
  if (typeof window === 'undefined') return false;
  if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return false; }
  const role = window.localStorage.getItem('skhata_role');
  if (role === 'admin') { router.replace('/admin'); return false; }
  if (role !== 'distributor') { router.replace('/dashboard'); return false; }
  return true;
}

export default function DistributorDemandBoard() {
  const router = useRouter();
  const { t } = useLang();
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const r = await apiFetch('/api/demand-board');
      setPosts(r.demand_posts || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!guard(router)) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function claim(id) {
    setError('');
    setClaiming(id);
    try {
      const r = await apiFetch(`/api/demand-board/${id}/claim`, { method: 'POST' });
      const poId = r.purchase_order && r.purchase_order.id;
      if (poId) {
        router.push(`/distributor/orders/${poId}`);
        return;
      }
      await load();
    } catch (err) {
      setError(err.message);
      await load(); // a 409 means someone else claimed it — refresh the board
    } finally {
      setClaiming('');
    }
  }

  return (
    <div>
      <DistNav />
      <div className="container">
        <h1>{t('dem.nearYou')}</h1>
        <p className="muted" style={{ marginTop: -6 }}>{t('dem.distSubtitle')}</p>

        {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}

        {loading ? (
          <div className="card">{t('common.loading')}</div>
        ) : posts.length === 0 ? (
          <div className="card">{t('dem.noOpen')}</div>
        ) : (
          posts.map((p) => (
            <div key={p.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <strong>{p.shop_name}</strong>
                  {p.shop_area && <span className="muted"> · {p.shop_area}</span>}
                  <div className="muted" style={{ marginTop: 2 }}>
                    {p.needed_by ? t('dem.neededByOn', { when: new Date(p.needed_by).toLocaleDateString() }) : t('dem.noDate')}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {(p.items || []).map((it) => (
                      <span key={it.id} className="badge" style={{ marginRight: 6, marginBottom: 4, display: 'inline-block' }}>
                        {it.qty} × {it.name}{it.unit ? ` ${it.unit}` : ''}
                      </span>
                    ))}
                  </div>
                  {p.note && <div className="muted" style={{ marginTop: 6 }}>{t('common.note')}: {p.note}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <button onClick={() => claim(p.id)} disabled={claiming === p.id}>
                    {claiming === p.id ? t('dem.claiming') : t('dem.claim')}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
