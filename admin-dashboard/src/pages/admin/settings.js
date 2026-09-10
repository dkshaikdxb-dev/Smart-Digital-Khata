import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import { apiFetch } from '../../lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || '';

// ---- Feature flags & pricing (batch FLAGS1) --------------------------------
// The session's runtime features live in platform_settings and are edited here.
// Money is integer paise under the hood: amounts show/edit as ₹ and are ×100 on
// save. Booleans are the plain feature switches; percents are the referral split.
const INR = new Intl.NumberFormat('en-IN');
const toRupees = (paise) => (Math.round(Number(paise) || 0)) / 100;
const toPaise = (rupees) => Math.round((Number(rupees) || 0) * 100);

// Plain feature switches (default ON except where noted).
const TOGGLE_KEYS = [
  ['voice_assistant_enabled', 'Voice assistant', 'Owner “Ask” mic — free, on-device voice help.'],
  ['social_share_enabled', 'Share poster', 'Owner “Share your shop” poster for WhatsApp / IG / FB.'],
  ['shop_promo_enabled', 'Shop promos', 'Self-serve promo campaigns a shop buys with Khata Credits.'],
  ['branded_store_enabled', 'Branded store', 'Paid branded storefront upgrade for a shop.'],
  ['consumer_prepay_enabled', 'Consumer prepay', 'Lets a customer hold a prepaid advance with a shop.'],
];
// Amount keys stored in paise, shown/edited as ₹.
const RUPEE_KEYS = [
  'enrolment_fee_basic_paise', 'enrolment_fee_premium_paise',
  'shop_promo_credits_per_day_paise', 'branded_store_credits_per_day_paise',
  'consumer_prepay_max_advance_paise', 'delivery_champion_fee_paise',
];
const INT_KEYS = ['shop_promo_max_days', 'branded_store_max_days'];
const PCT_KEYS = ['referral_split_infra_pct', 'referral_split_l1_pct', 'referral_split_l2_pct'];

// Build the editable form state from the API `features` object: amounts → ₹.
function featFromApi(f) {
  const o = { enrolment_fee_enabled: !!f.enrolment_fee_enabled };
  TOGGLE_KEYS.forEach(([k]) => { o[k] = !!f[k]; });
  RUPEE_KEYS.forEach((k) => { o[k] = toRupees(f[k]); });
  INT_KEYS.forEach((k) => { o[k] = Number(f[k]) || 0; });
  PCT_KEYS.forEach((k) => { o[k] = Number(f[k]) || 0; });
  return o;
}

export default function AdminSettings() {
  const router = useRouter();
  const [s, setS] = useState(null);
  const [rz, setRz] = useState({});
  const [wa, setWa] = useState({});
  const [landing, setLanding] = useState({ landing_whatsapp: '' });
  const [feat, setFeat] = useState(null);
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
      if (d.features) setFeat(featFromApi(d.features));
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

  // Feature flags & pricing: PATCH then refresh both the raw settings and the
  // editable feature form so amounts round-trip through paise consistently.
  async function saveFeat(body, note) {
    setMsg(''); setErr('');
    try {
      await apiFetch('/api/admin/settings', { method: 'PATCH', body: JSON.stringify(body) });
      const fresh = await apiFetch('/api/admin/settings');
      setS(fresh);
      if (fresh.features) setFeat(featFromApi(fresh.features));
      setMsg(note);
    } catch (e) { setErr(e.message); }
  }

  function saveToggles() {
    const body = {};
    TOGGLE_KEYS.forEach(([k]) => { body[k] = !!feat[k]; });
    saveFeat(body, 'Feature toggles saved.');
  }

  // Master switch for paid enrolment — MONEY-CRITICAL. Turning it ON is confirmed
  // and persists immediately so the warning can never be bypassed by forgetting
  // to save.
  function toggleEnrolmentMaster(next) {
    if (next && !window.confirm(
      'Turn ON paid ₹ enrolment for NEW shops?\n\n'
      + 'New shops will be charged the enrolment fee before they can start. '
      + 'Make sure the basic/premium fees and the referral split below are correct first.'
    )) return;
    setFeat({ ...feat, enrolment_fee_enabled: next });
    saveFeat({ enrolment_fee_enabled: next }, next ? 'Paid enrolment turned ON.' : 'Paid enrolment turned OFF.');
  }

  function saveEnrolmentEconomics() {
    const sum = Number(feat.referral_split_infra_pct) + Number(feat.referral_split_l1_pct) + Number(feat.referral_split_l2_pct);
    if (sum > 100) { setErr(`Referral split must total ≤ 100% (currently ${sum}%).`); return; }
    saveFeat({
      enrolment_fee_basic_paise: toPaise(feat.enrolment_fee_basic_paise),
      enrolment_fee_premium_paise: toPaise(feat.enrolment_fee_premium_paise),
      referral_split_infra_pct: Number(feat.referral_split_infra_pct),
      referral_split_l1_pct: Number(feat.referral_split_l1_pct),
      referral_split_l2_pct: Number(feat.referral_split_l2_pct),
    }, 'Enrolment fees & referral split saved.');
  }

  function savePricing() {
    saveFeat({
      shop_promo_credits_per_day_paise: toPaise(feat.shop_promo_credits_per_day_paise),
      shop_promo_max_days: Number(feat.shop_promo_max_days),
      branded_store_credits_per_day_paise: toPaise(feat.branded_store_credits_per_day_paise),
      branded_store_max_days: Number(feat.branded_store_max_days),
      consumer_prepay_max_advance_paise: toPaise(feat.consumer_prepay_max_advance_paise),
      delivery_champion_fee_paise: toPaise(feat.delivery_champion_fee_paise),
    }, 'Pricing saved.');
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

      {feat && (() => {
        const splitSum = Number(feat.referral_split_infra_pct) + Number(feat.referral_split_l1_pct) + Number(feat.referral_split_l2_pct);
        const buffer = 100 - splitSum;
        const splitOk = splitSum <= 100;
        const rupeeInput = (key, label, help) => (
          <div>
            <label className="muted">{label} (₹)</label>
            <input type="number" min="0" step="1" inputMode="numeric" value={feat[key]}
              onChange={(e) => setFeat({ ...feat, [key]: e.target.value })} />
            {help && <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>{help}</p>}
          </div>
        );
        return (
          <>
            {/* Feature flags & pricing (batch FLAGS1) */}
            <div className="card">
              <h3>Feature toggles</h3>
              <p className="muted">Turn platform features on or off. Changes read live — a save applies within a minute.</p>
              <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
                {TOGGLE_KEYS.map(([key, label, desc]) => (
                  <label key={key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <input type="checkbox" checked={!!feat[key]} style={{ marginTop: 3 }}
                      onChange={(e) => setFeat({ ...feat, [key]: e.target.checked })} />
                    <span><b>{label}</b><br /><span className="muted" style={{ fontSize: 13 }}>{desc}</span></span>
                  </label>
                ))}
                <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
                  <button onClick={saveToggles}>Save feature toggles</button>
                </div>
              </div>
            </div>

            {/* Enrolment & economics — money-critical, warning-tinted */}
            <div className="card" style={{ borderColor: 'var(--danger)' }}>
              <h3>Enrolment &amp; economics</h3>
              <p className="muted" style={{ fontSize: 13 }}>
                Money-critical. The referral split feeds the zero-burn engine — infra + L1 + L2 can never exceed 100%.
              </p>
              <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={!!feat.enrolment_fee_enabled} style={{ marginTop: 3 }}
                    onChange={(e) => toggleEnrolmentMaster(e.target.checked)} />
                  <span>
                    <b>Paid enrolment {feat.enrolment_fee_enabled ? 'ON' : 'OFF'}</b>
                    <br />
                    <span style={{ fontSize: 13, color: 'var(--danger)' }}>
                      Turns on paid ₹ enrolment for new shops. New shops are charged the fee before they can start.
                    </span>
                  </span>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {rupeeInput('enrolment_fee_basic_paise', 'Basic enrolment fee')}
                  {rupeeInput('enrolment_fee_premium_paise', 'Premium enrolment fee')}
                </div>
                <label className="muted">Referral split (% of the fee)</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  {PCT_KEYS.map((key, i) => (
                    <div key={key}>
                      <label className="muted" style={{ fontSize: 12 }}>{['Infra', 'L1', 'L2'][i]} %</label>
                      <input type="number" min="0" max="100" step="1" value={feat[key]}
                        onChange={(e) => setFeat({ ...feat, [key]: e.target.value })} />
                    </div>
                  ))}
                </div>
                <p className="muted" style={{ fontSize: 13, color: splitOk ? undefined : 'var(--danger)' }}>
                  Must total ≤ 100 — currently {splitSum}% · infra buffer = {buffer}%
                  {!splitOk && ' (too high — reduce a share)'}
                </p>
                <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
                  <button onClick={saveEnrolmentEconomics} disabled={!splitOk}>Save fees &amp; split</button>
                </div>
              </div>
            </div>

            {/* Pricing */}
            <div className="card">
              <h3>Pricing</h3>
              <p className="muted">Fees &amp; ceilings for the paid features. All amounts in ₹ (stored as paise).</p>
              <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {rupeeInput('shop_promo_credits_per_day_paise', 'Shop promo — per day')}
                  <div>
                    <label className="muted">Shop promo — max days</label>
                    <input type="number" min="1" step="1" value={feat.shop_promo_max_days}
                      onChange={(e) => setFeat({ ...feat, shop_promo_max_days: e.target.value })} />
                  </div>
                  {rupeeInput('branded_store_credits_per_day_paise', 'Branded store — per day')}
                  <div>
                    <label className="muted">Branded store — max days</label>
                    <input type="number" min="1" step="1" value={feat.branded_store_max_days}
                      onChange={(e) => setFeat({ ...feat, branded_store_max_days: e.target.value })} />
                  </div>
                  {rupeeInput('consumer_prepay_max_advance_paise', 'Consumer prepay — max advance')}
                  {rupeeInput('delivery_champion_fee_paise', 'Delivery champion fee')}
                </div>
                <p className="muted" style={{ fontSize: 12 }}>
                  Promo {`₹${INR.format(feat.shop_promo_credits_per_day_paise)}`}/day · branded {`₹${INR.format(feat.branded_store_credits_per_day_paise)}`}/day ·
                  prepay cap {`₹${INR.format(feat.consumer_prepay_max_advance_paise)}`} · delivery {`₹${INR.format(feat.delivery_champion_fee_paise)}`}
                </p>
                <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
                  <button onClick={savePricing}>Save pricing</button>
                </div>
              </div>
            </div>

            {/* Coming soon — inert Meta auto-post stub, always locked */}
            <div className="card">
              <h3>Coming soon</h3>
              <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', opacity: 0.6 }}>
                  <input type="checkbox" checked={false} disabled style={{ marginTop: 3 }} />
                  <span>
                    <b>Meta auto-post</b> <span className="badge">coming soon</span>
                    <br />
                    <span className="muted" style={{ fontSize: 13 }}>
                      Not available yet — needs Meta app setup. Auto-posting to Facebook / Instagram is an inert stub pending credentials.
                    </span>
                  </span>
                </label>
              </div>
            </div>
          </>
        );
      })()}
    </Shell>
  );
}

function Shell({ children }) {
  return (<div><Nav /><div className="container">{children}</div></div>);
}
