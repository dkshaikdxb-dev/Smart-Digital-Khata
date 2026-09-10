import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../components/Nav';
import { apiFetch } from '../lib/api';
import { useLang } from '../lib/i18n';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;

// Build the champion's no-login link from THIS origin so a copied link always
// points at the /d/[token] page the shopkeeper is looking at (the backend also
// returns c.link, but that depends on its ADMIN_URL env — the origin is exact).
function championLink(token) {
  if (typeof window === 'undefined') return `/d/${token}`;
  return `${window.location.origin}/d/${token}`;
}

const dstatusColor = (s) => {
  if (s === 'delivered') return 'var(--accent)';
  if (s === 'cancelled') return 'var(--danger)';
  return 'var(--text)';
};

export default function Delivery() {
  const router = useRouter();
  const { t } = useLang();
  const [champions, setChampions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState({ name: '', phone: '', area: '' });
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [assign, setAssign] = useState({}); // orderId -> { champion_id, fee }
  const [error, setError] = useState('');

  async function load() {
    const [c, o] = await Promise.all([
      apiFetch('/api/delivery/champions'),
      apiFetch('/api/delivery/orders'),
    ]);
    setChampions(c.items || []);
    setOrders(o.items || []);
  }

  useEffect(() => {
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    const role = window.localStorage.getItem('skhata_role');
    if (role === 'admin') { router.replace('/admin'); return; }
    if (role === 'distributor') { router.replace('/distributor'); return; }
    if (role === 'staff') { router.replace('/orders'); return; } // owner-only page
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addChampion(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setAdding(true);
    setError('');
    try {
      await apiFetch('/api/delivery/champions', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          area: form.area.trim() || null,
        }),
      });
      setForm({ name: '', phone: '', area: '' });
      await load();
    } catch (err) { setError(err.message || t('dlv.errGeneric')); }
    finally { setAdding(false); }
  }

  async function toggleActive(c) {
    setBusy(c.id);
    setError('');
    try {
      await apiFetch(`/api/delivery/champions/${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !c.is_active }),
      });
      await load();
    } catch (err) { setError(err.message || t('dlv.errGeneric')); }
    finally { setBusy(null); }
  }

  async function copyLink(c) {
    const link = championLink(c.access_token);
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(c.id);
      setTimeout(() => setCopiedId((id) => (id === c.id ? null : id)), 1500);
    } catch (e) {
      // Clipboard blocked (insecure context / old browser): show the link so the
      // shopkeeper can copy it by hand rather than failing silently.
      window.prompt(t('dlv.copyLink'), link);
    }
  }

  async function doAssign(order) {
    const a = assign[order.order_id] || {};
    if (!a.champion_id) { setError(t('dlv.needChampion')); return; }
    setBusy(order.order_id);
    setError('');
    try {
      const body = { order_id: order.order_id, champion_id: a.champion_id };
      if (a.fee !== undefined && a.fee !== '') body.fee_paise = Math.round(Number(a.fee) * 100);
      await apiFetch('/api/delivery/assign', { method: 'POST', body: JSON.stringify(body) });
      await load();
    } catch (err) { setError(err.message || t('dlv.errGeneric')); }
    finally { setBusy(null); }
  }

  const setA = (orderId, patch) =>
    setAssign((s) => ({ ...s, [orderId]: { ...(s[orderId] || {}), ...patch } }));

  const activeChampions = champions.filter((c) => c.is_active);

  return (
    <div>
      <Nav />
      <div className="container">
        <h1>{t('dlv.title')}</h1>
        <p className="muted" style={{ maxWidth: 640 }}>{t('dlv.subtitle')}</p>
        {error && <div className="card" style={{ color: 'var(--danger)' }}>{error}</div>}

        {/* Add a champion */}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{t('dlv.addTitle')}</h3>
          <form onSubmit={addChampion} className="grid" style={{ alignItems: 'end' }}>
            <label>
              <div className="muted">{t('dlv.name')}</div>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t('dlv.namePlaceholder')} maxLength={120} />
            </label>
            <label>
              <div className="muted">{t('dlv.phone')}</div>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder={t('dlv.phonePlaceholder')} maxLength={30} />
            </label>
            <label>
              <div className="muted">{t('dlv.area')}</div>
              <input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}
                placeholder={t('dlv.areaPlaceholder')} maxLength={200} />
            </label>
            <button type="submit" disabled={adding || !form.name.trim()}>
              {adding ? t('dlv.adding') : t('dlv.add')}
            </button>
          </form>
        </div>

        {/* Champions list */}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{t('dlv.champions')}</h3>
          {champions.length === 0 ? (
            <div className="muted">{t('dlv.noChampions')}</div>
          ) : (
            <div className="grid">
              {champions.map((c) => (
                <div key={c.id} className="card" style={{ margin: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong>{c.name}</strong>
                    <span className="badge" style={{ color: c.is_active ? 'var(--accent)' : 'var(--muted)' }}>
                      {c.is_active ? t('dlv.active') : t('dlv.inactive')}
                    </span>
                  </div>
                  {c.phone && <div className="muted">{c.phone}</div>}
                  {c.area && <div className="muted">{c.area}</div>}
                  <div className="muted" style={{ marginTop: 6 }}>
                    {t('dlv.activeDeliveries', { n: c.active_deliveries || 0 })}
                    {' · '}
                    {t('dlv.deliveredCount', { n: c.delivered_count || 0 })}
                  </div>
                  <div className="row-actions" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
                    <button className="secondary" onClick={() => copyLink(c)}>
                      {copiedId === c.id ? t('dlv.copied') : t('dlv.copyLink')}
                    </button>
                    <button className="secondary" disabled={busy === c.id} onClick={() => toggleActive(c)}>
                      {c.is_active ? t('dlv.deactivate') : t('dlv.activate')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Delivery orders */}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{t('dlv.orders')}</h3>
          {orders.length === 0 ? (
            <div className="muted">{t('dlv.noOrders')}</div>
          ) : (
            <div className="grid">
              {orders.map((o) => {
                const a = assign[o.order_id] || {};
                return (
                  <div key={o.order_id} className="card" style={{ margin: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <strong>{o.customer_name || '—'}</strong>
                      <span>{fmt(o.total)}</span>
                    </div>
                    {o.customer_phone && <div className="muted">{o.customer_phone}</div>}
                    {o.address && <div className="muted">{o.address}</div>}
                    <div className="muted" style={{ marginTop: 4 }}>
                      {new Date(o.created_at).toLocaleString()}
                    </div>

                    {o.delivery_id ? (
                      <div style={{ marginTop: 10 }}>
                        <div>
                          <span className="muted">{t('dlv.champion')}: </span>
                          <strong>{o.champion_name}</strong>
                        </div>
                        <span className="badge" style={{ color: dstatusColor(o.delivery_status), marginTop: 6 }}>
                          {t(`dlv.dstatus.${o.delivery_status}`)}
                        </span>
                      </div>
                    ) : (
                      <div style={{ marginTop: 10 }}>
                        <span className="badge muted">{t('dlv.unassigned')}</span>
                        <div className="grid" style={{ marginTop: 8, gridTemplateColumns: '1fr', gap: 8 }}>
                          <select value={a.champion_id || ''}
                            onChange={(e) => setA(o.order_id, { champion_id: e.target.value })}>
                            <option value="">{t('dlv.pickChampion')}</option>
                            {activeChampions.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                          <input type="number" min="0" step="1" inputMode="numeric"
                            value={a.fee === undefined ? '' : a.fee}
                            onChange={(e) => setA(o.order_id, { fee: e.target.value })}
                            placeholder={t('dlv.feeLabel')} />
                          <button disabled={busy === o.order_id || !a.champion_id}
                            onClick={() => doAssign(o)}>
                            {busy === o.order_id ? t('dlv.assigning') : t('dlv.assign')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
