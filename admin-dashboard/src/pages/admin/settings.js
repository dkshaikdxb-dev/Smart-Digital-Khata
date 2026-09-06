import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import { apiFetch } from '../../lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || '';

export default function AdminSettings() {
  const router = useRouter();
  const [s, setS] = useState(null);
  const [rz, setRz] = useState({});
  const [wa, setWa] = useState({});
  const [landing, setLanding] = useState({ landing_whatsapp: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem('skhata_token')) { router.replace('/login'); return; }
    if (window.localStorage.getItem('skhata_role') !== 'admin') { router.replace('/'); return; }
    setOrigin(window.location.origin);
    apiFetch('/api/admin/settings').then((d) => {
      setS(d);
      setRz({ razorpay_key_id: d.razorpay.key_id || '', razorpay_plan_pro: d.razorpay.plan_pro || '', razorpay_plan_family: d.razorpay.plan_family || '' });
      setWa({
        whatsapp_phone_number_id: d.whatsapp.phone_number_id || '',
        whatsapp_business_account_id: d.whatsapp.business_account_id || '',
        whatsapp_verify_token: d.whatsapp.verify_token || '',
        whatsapp_template_reminder: d.whatsapp.template_reminder || '',
        whatsapp_template_lang: d.whatsapp.template_lang || 'en',
      });
      setLanding({ landing_whatsapp: (d.landing && d.landing.whatsapp) || '' });
    }).catch((e) => setErr(e.message));
  }, [router]);

  if (err && !s) return <Shell><div className="card" style={{ color: 'var(--danger)' }}>{err}</div></Shell>;
  if (!s) return <Shell><div className="card">Loading…</div></Shell>;

  async function save(body, note) {
    setMsg(''); setErr('');
    try {
      await apiFetch('/api/admin/settings', { method: 'PATCH', body: JSON.stringify(body) });
      const fresh = await apiFetch('/api/admin/settings'); setS(fresh);
      setMsg(note);
    } catch (e) { setErr(e.message); }
  }

  async function testRazorpay() {
    setMsg(''); setErr('');
    const r = await fetch(`${API}/api/admin/settings/razorpay/test`, {
      method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('skhata_token')}` },
    }).then((x) => x.json());
    r.ok ? setMsg(`✅ ${r.message}`) : setErr(`Razorpay: ${r.message}`);
  }

  async function testWhatsapp() {
    setMsg(''); setErr('');
    const to = window.prompt('Send a test WhatsApp to which number? (+91…)');
    if (!to) return;
    try {
      const r = await apiFetch('/api/admin/settings/whatsapp/test', { method: 'POST', body: JSON.stringify({ to }) });
      setMsg(r.ok ? '✅ Test WhatsApp sent.' : r.message);
    } catch (e) { setErr(`WhatsApp: ${e.message}`); }
  }

  const badge = (label, on) => (
    <span className="badge" style={on ? { background: 'var(--accent)', color: '#000' } : undefined}>{label}: {on ? 'set' : 'not set'}</span>
  );

  return (
    <Shell>
      <button className="secondary" onClick={() => router.push('/admin')} style={{ marginBottom: 12 }}>← Platform</button>
      <h1>Integration settings</h1>
      {msg && <div className="card" style={{ color: 'var(--accent)' }}>{msg}</div>}
      {err && <div className="card" style={{ color: 'var(--danger)' }}>{err}</div>}

      {/* Razorpay */}
      <div className="card">
        <h3>Razorpay {s.razorpay.mode && <span className="badge">{s.razorpay.mode} mode</span>}</h3>
        <p className="muted">Payment links + subscriptions. Get keys at dashboard.razorpay.com → API Keys.</p>
        <div style={{ display: 'grid', gap: 10, maxWidth: 560 }}>
          <label className="muted">Key ID</label>
          <input placeholder="rzp_live_… or rzp_test_…" value={rz.razorpay_key_id} onChange={(e) => setRz({ ...rz, razorpay_key_id: e.target.value })} />
          <label className="muted">Key Secret {s.razorpay.key_secret_set && <span className="badge" style={{ background: 'var(--accent)', color: '#000' }}>saved</span>}</label>
          <input type="password" placeholder={s.razorpay.key_secret_set ? '•••••••• (leave blank to keep)' : 'Key secret'} onChange={(e) => setRz({ ...rz, razorpay_key_secret: e.target.value })} />
          <label className="muted">Webhook Secret {s.razorpay.webhook_secret_set && <span className="badge" style={{ background: 'var(--accent)', color: '#000' }}>saved</span>}</label>
          <input type="password" placeholder={s.razorpay.webhook_secret_set ? '•••••••• (leave blank to keep)' : 'Webhook secret'} onChange={(e) => setRz({ ...rz, razorpay_webhook_secret: e.target.value })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="muted">Pro plan ID</label><input placeholder="plan_…" value={rz.razorpay_plan_pro} onChange={(e) => setRz({ ...rz, razorpay_plan_pro: e.target.value })} /></div>
            <div><label className="muted">Family plan ID</label><input placeholder="plan_…" value={rz.razorpay_plan_family} onChange={(e) => setRz({ ...rz, razorpay_plan_family: e.target.value })} /></div>
          </div>
          <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
            <button onClick={() => save(rz, 'Razorpay settings saved.')}>Save Razorpay</button>
            <button className="secondary" onClick={testRazorpay}>Test connection</button>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>Webhook URL to paste in Razorpay → Webhooks: <code>{origin}/api/webhooks/razorpay</code></p>
        </div>
      </div>

      {/* WhatsApp */}
      <div className="card">
        <h3>WhatsApp Cloud API {badge('token', s.whatsapp.api_token_set)}</h3>
        <p className="muted">Notifications + inbound commands. From Meta → WhatsApp → API Setup.</p>
        <div style={{ display: 'grid', gap: 10, maxWidth: 560 }}>
          <label className="muted">Permanent Access Token {s.whatsapp.api_token_set && <span className="badge" style={{ background: 'var(--accent)', color: '#000' }}>saved</span>}</label>
          <input type="password" placeholder={s.whatsapp.api_token_set ? '•••••••• (leave blank to keep)' : 'EAA…'} onChange={(e) => setWa({ ...wa, whatsapp_api_token: e.target.value })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="muted">Phone Number ID</label><input value={wa.whatsapp_phone_number_id} onChange={(e) => setWa({ ...wa, whatsapp_phone_number_id: e.target.value })} /></div>
            <div><label className="muted">Business Account ID</label><input value={wa.whatsapp_business_account_id} onChange={(e) => setWa({ ...wa, whatsapp_business_account_id: e.target.value })} /></div>
          </div>
          <label className="muted">Verify Token (any string; paste same in Meta webhook)</label>
          <input value={wa.whatsapp_verify_token} onChange={(e) => setWa({ ...wa, whatsapp_verify_token: e.target.value })} />
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <div><label className="muted">Reminder template name</label><input placeholder="dues_reminder" value={wa.whatsapp_template_reminder} onChange={(e) => setWa({ ...wa, whatsapp_template_reminder: e.target.value })} /></div>
            <div><label className="muted">Template language</label><input value={wa.whatsapp_template_lang} onChange={(e) => setWa({ ...wa, whatsapp_template_lang: e.target.value })} /></div>
          </div>
          <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
            <button onClick={() => save(wa, 'WhatsApp settings saved.')}>Save WhatsApp</button>
            <button className="secondary" onClick={testWhatsapp}>Send test message</button>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>Webhook URL for Meta: <code>{origin}/api/webhooks/whatsapp</code> (subscribe to <b>messages</b>)</p>
        </div>

        <div className="card">
          <h3>Public website</h3>
          <p className="muted" style={{ fontSize: 13 }}>The “chat with us” WhatsApp number shown on the marketing landing (khata.dadashaik.com). International digits, e.g. <code>919731422995</code> — no “+”. Changes go live within a minute; leave blank to use the built-in default. This is separate from the Cloud API sender above.</p>
          <label className="muted">Landing WhatsApp number</label>
          <input inputMode="numeric" placeholder="919731422995" value={landing.landing_whatsapp} onChange={(e) => setLanding({ landing_whatsapp: e.target.value })} />
          <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
            <button onClick={() => save(landing, 'Landing settings saved.')}>Save landing</button>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return (<div><Nav /><div className="container">{children}</div></div>);
}
