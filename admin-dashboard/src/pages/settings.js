import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../components/Nav';
import { apiFetch } from '../lib/api';

export default function Settings() {
  const router = useRouter();
  const [shop, setShop] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') === 'admin') { router.replace('/admin'); return; }
    apiFetch('/api/shops/me').then((r) => setShop(r.shop)).catch(console.error);
  }, [router]);

  if (!shop) return (<div><Nav /><div className="container">Loading…</div></div>);

  async function save() {
    setMsg('');
    try {
      const r = await apiFetch('/api/shops/me', {
        method: 'PATCH',
        body: JSON.stringify({ name: shop.name, notification_mode: shop.notification_mode }),
      });
      setShop(r.shop);
      setMsg('Saved.');
    } catch (e) { setMsg(e.message); }
  }

  return (
    <div>
      <Nav />
      <div className="container">
        <h1>Settings</h1>
        <div className="card" style={{ maxWidth: 480 }}>
          <label className="muted">Shop name</label>
          <input value={shop.name} onChange={(e) => setShop({ ...shop, name: e.target.value })} />
          <div style={{ height: 12 }} />
          <label className="muted">Notification mode</label>
          <select value={shop.notification_mode} onChange={(e) => setShop({ ...shop, notification_mode: e.target.value })}>
            <option value="silent">Silent — never auto-notify</option>
            <option value="smart">Smart — only significant events</option>
            <option value="active">Active — every transaction + daily reminders</option>
          </select>
          <div style={{ height: 16 }} />
          <button onClick={save}>Save</button>
          {msg && <div className="muted" style={{ marginTop: 8 }}>{msg}</div>}
        </div>
      </div>
    </div>
  );
}
