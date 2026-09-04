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

  // Payments (per-shop Razorpay)
  const [pay, setPay] = useState(null);
  const [payForm, setPayForm] = useState({ razorpay_key_id: '', razorpay_key_secret: '', razorpay_webhook_secret: '' });
  const [payMsg, setPayMsg] = useState('');

  // Discovery
  const [discoveryMsg, setDiscoveryMsg] = useState('');

  function loadPayment() {
    apiFetch('/api/shops/me/payment').then((r) => {
      const p = r.payment || r;
      setPay(p);
      setPayForm({ razorpay_key_id: p.key_id || '', razorpay_key_secret: '', razorpay_webhook_secret: '' });
    }).catch(console.error);
  }

  useEffect(() => {
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') === 'admin') { router.replace('/admin'); return; }
    apiFetch('/api/shops/me').then((r) => setShop(r.shop)).catch(console.error);
    apiFetch('/api/subscriptions/plans').then((r) => setPlans(r.plans)).catch(console.error);
    apiFetch('/api/subscriptions/me').then((r) => setSub(r.subscription)).catch(console.error);
    loadPayment();
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

  async function savePayment() {
    setPayMsg('');
    const body = { razorpay_key_id: payForm.razorpay_key_id };
    if (payForm.razorpay_key_secret) body.razorpay_key_secret = payForm.razorpay_key_secret;
    if (payForm.razorpay_webhook_secret) body.razorpay_webhook_secret = payForm.razorpay_webhook_secret;
    try {
      await apiFetch('/api/shops/me/payment', { method: 'PATCH', body: JSON.stringify(body) });
      setPayForm((f) => ({ ...f, razorpay_key_secret: '', razorpay_webhook_secret: '' }));
      loadPayment();
      setPayMsg('Payment settings saved.');
    } catch (e) { setPayMsg(e.message); }
  }

  async function testPayment() {
    setPayMsg('');
    try {
      const r = await apiFetch('/api/shops/me/payment/test', { method: 'POST' });
      setPayMsg(r.ok === false ? `Connection failed: ${r.error || 'check your keys'}` : 'Connection OK — your Razorpay keys work.');
    } catch (e) { setPayMsg(`Connection failed: ${e.message}`); }
  }

  async function saveDiscovery() {
    setDiscoveryMsg('');
    try {
      const r = await apiFetch('/api/shops/me', {
        method: 'PATCH',
        body: JSON.stringify({
          city: shop.city || null,
          area: shop.area || null,
          latitude: shop.latitude === '' || shop.latitude == null ? null : Number(shop.latitude),
          longitude: shop.longitude === '' || shop.longitude == null ? null : Number(shop.longitude),
          is_listed: !!shop.is_listed,
        }),
      });
      setShop(r.shop);
      setDiscoveryMsg('Saved.');
    } catch (e) { setDiscoveryMsg(e.message); }
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

        <div className="card" style={{ maxWidth: 520 }}>
          <h3>Payments (your Razorpay)</h3>
          <p className="muted">
            Mode: <span className="badge">{pay?.mode || '—'}</span>{' '}
            <span className="badge">{pay?.key_secret_set ? 'Key secret set' : 'No key secret'}</span>{' '}
            <span className="badge">{pay?.webhook_secret_set ? 'Webhook secret set' : 'No webhook secret'}</span>
          </p>
          <label className="muted">Razorpay Key ID</label>
          <input value={payForm.razorpay_key_id} onChange={(e) => setPayForm({ ...payForm, razorpay_key_id: e.target.value })} placeholder="rzp_live_… / rzp_test_…" />
          <div style={{ height: 12 }} />
          <label className="muted">Key Secret</label>
          <input type="password" value={payForm.razorpay_key_secret} onChange={(e) => setPayForm({ ...payForm, razorpay_key_secret: e.target.value })} placeholder="Leave blank to keep current" autoComplete="new-password" />
          <div style={{ height: 12 }} />
          <label className="muted">Webhook Secret</label>
          <input type="password" value={payForm.razorpay_webhook_secret} onChange={(e) => setPayForm({ ...payForm, razorpay_webhook_secret: e.target.value })} placeholder="Leave blank to keep current" autoComplete="new-password" />
          <div style={{ height: 16 }} />
          <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
            <button onClick={savePayment}>Save payment settings</button>
            <button className="secondary" onClick={testPayment}>Test connection</button>
          </div>
          {pay?.webhook_url && (
            <div style={{ marginTop: 14 }}>
              <div className="muted">Add this as a webhook in YOUR Razorpay dashboard:</div>
              <code style={{ display: 'block', wordBreak: 'break-all', marginTop: 4, padding: '8px 10px', borderRadius: 8, background: '#0b1220', border: '1px solid #334155' }}>{pay.webhook_url}</code>
            </div>
          )}
          {payMsg && <div className="muted" style={{ marginTop: 10 }}>{payMsg}</div>}
        </div>

        <div className="card" style={{ maxWidth: 520 }}>
          <h3>Discovery (list your shop)</h3>
          <p className="muted">Let nearby customers find and order from your shop.</p>
          <label className="muted">City</label>
          <input value={shop.city || ''} onChange={(e) => setShop({ ...shop, city: e.target.value })} placeholder="City" />
          <div style={{ height: 12 }} />
          <label className="muted">Area / locality</label>
          <input value={shop.area || ''} onChange={(e) => setShop({ ...shop, area: e.target.value })} placeholder="Area" />
          <div style={{ height: 12 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="muted">Latitude</label>
              <input type="number" step="any" value={shop.latitude ?? ''} onChange={(e) => setShop({ ...shop, latitude: e.target.value })} placeholder="e.g. 19.0760" />
            </div>
            <div>
              <label className="muted">Longitude</label>
              <input type="number" step="any" value={shop.longitude ?? ''} onChange={(e) => setShop({ ...shop, longitude: e.target.value })} placeholder="e.g. 72.8777" />
            </div>
          </div>
          <div style={{ height: 12 }} />
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={!!shop.is_listed} onChange={(e) => setShop({ ...shop, is_listed: e.target.checked })} />
            <span>List my shop so nearby customers can find and order</span>
          </label>
          <div style={{ height: 16 }} />
          <button onClick={saveDiscovery}>Save</button>
          {discoveryMsg && <div className="muted" style={{ marginTop: 8 }}>{discoveryMsg}</div>}
        </div>
      </div>
    </div>
  );
}
