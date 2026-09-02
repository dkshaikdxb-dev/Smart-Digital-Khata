import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../components/Nav';
import { apiFetch } from '../lib/api';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;

export default function Settings() {
  const router = useRouter();
  const [shop, setShop] = useState(null);
  const [msg, setMsg] = useState('');
  const [plans, setPlans] = useState([]);
  const [sub, setSub] = useState(null);
  const [billingMsg, setBillingMsg] = useState('');

  useEffect(() => {
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') === 'admin') { router.replace('/admin'); return; }
    apiFetch('/api/shops/me').then((r) => setShop(r.shop)).catch(console.error);
    apiFetch('/api/subscriptions/plans').then((r) => setPlans(r.plans)).catch(console.error);
    apiFetch('/api/subscriptions/me').then((r) => setSub(r.subscription)).catch(console.error);
  }, [router]);

  if (!shop) return (<div><Nav /><div className="container">Loading…</div></div>);

  async function save() {
    setMsg('');
    try {
      const r = await apiFetch('/api/shops/me', {
        method: 'PATCH',
        body: JSON.stringify({
          name: shop.name,
          notification_mode: shop.notification_mode,
          daily_digest: shop.daily_digest !== false,
        }),
      });
      setShop(r.shop);
      setMsg('Saved.');
    } catch (e) { setMsg(e.message); }
  }

  async function choosePlan(code) {
    setBillingMsg('');
    try {
      const r = await apiFetch('/api/subscriptions/upgrade', {
        method: 'POST',
        body: JSON.stringify({ plan: code }),
      });
      if (r.authorization_url) {
        setBillingMsg('Complete the payment authorization in the new tab to activate your plan.');
        window.open(r.authorization_url, '_blank', 'noopener');
      } else {
        setBillingMsg(`Plan updated to ${code}.`);
      }
      const [s, m] = await Promise.all([apiFetch('/api/shops/me'), apiFetch('/api/subscriptions/me')]);
      setShop(s.shop); setSub(m.subscription);
    } catch (e) { setBillingMsg(e.message); }
  }

  return (
    <div>
      <Nav />
      <div className="container">
        <h1>Settings</h1>

        <div className="card" style={{ maxWidth: 520 }}>
          <h3>Shop</h3>
          <label className="muted">Shop name</label>
          <input value={shop.name} onChange={(e) => setShop({ ...shop, name: e.target.value })} />
          <div style={{ height: 12 }} />
          <label className="muted">Customer notifications</label>
          <select value={shop.notification_mode} onChange={(e) => setShop({ ...shop, notification_mode: e.target.value })}>
            <option value="silent">Silent — never auto-notify</option>
            <option value="smart">Smart — only significant events</option>
            <option value="active">Active — every transaction + daily reminders</option>
          </select>
          <div style={{ height: 12 }} />
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={shop.daily_digest !== false}
              onChange={(e) => setShop({ ...shop, daily_digest: e.target.checked })}
            />
            <span>Send me &ldquo;Aaj ka hisaab&rdquo; on WhatsApp every evening (9pm)</span>
          </label>
          <div style={{ height: 16 }} />
          <button onClick={save}>Save</button>
          {msg && <div className="muted" style={{ marginTop: 8 }}>{msg}</div>}
        </div>

        <div className="card" style={{ maxWidth: 520 }}>
          <h3>Billing</h3>
          <p className="muted">
            Current plan: <span className="badge">{shop.plan}</span>
            {sub?.status === 'pending' && ' — payment authorization pending'}
          </p>
          {sub?.status === 'pending' && sub.authorization_url && (
            <p><a href={sub.authorization_url} target="_blank" rel="noreferrer">Finish payment authorization →</a></p>
          )}
          <div style={{ display: 'grid', gap: 10 }}>
            {plans.map((p) => (
              <div key={p.code} style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #334155', paddingBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <strong>{p.name}</strong>{' '}
                  <span className="muted">{p.price === 0 ? 'Free' : `${fmt(p.price)}/month`} · up to {p.limits.customers} customers</span>
                </div>
                {shop.plan === p.code ? (
                  <span className="badge">current</span>
                ) : (
                  <button className="secondary" onClick={() => choosePlan(p.code)}>
                    {p.price === 0 ? 'Downgrade' : 'Choose'}
                  </button>
                )}
              </div>
            ))}
          </div>
          {billingMsg && <div className="muted" style={{ marginTop: 10 }}>{billingMsg}</div>}
        </div>
      </div>
    </div>
  );
}
