import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import ConfirmTyped, { CONFIRM_PHRASE } from '../../components/ConfirmTyped';
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
  ['storefront_ad_free_enabled', 'Storefront ad-free buy-out', 'Lets a shop spend Khata Credits to keep the sponsored slide off its storefront.'],
  ['ai_moderation_enabled', 'AI moderation triage', 'An AI pre-screens shop photos and owner promos: auto-approves the clearly safe, flags the unsafe to the top of the queue. Never rejects. Needs the API key + moderation model id (Integrations → AI, below).'],
];
// AI moderation thresholds (batch AI-MOD): decimals in 0.5..1.0, edited as-is.
const DEC_KEYS = ['ai_moderation_auto_approve_min', 'ai_moderation_hold_min'];
// Amount keys stored in paise, shown/edited as ₹.
const RUPEE_KEYS = [
  'enrolment_fee_basic_paise', 'enrolment_fee_premium_paise',
  'shop_promo_credits_per_day_paise', 'branded_store_credits_per_day_paise',
  'storefront_ad_free_credits_per_day_paise',
  'consumer_prepay_max_advance_paise', 'delivery_champion_fee_paise',
];
const INT_KEYS = [
  'shop_promo_max_days', 'branded_store_max_days', 'storefront_ad_free_max_days',
  // Repeating new-order alert (batch ORDERALERT): the platform bounds a shop's
  // own alert cadence is clamped to. Plain policy numbers, NOT credentials — so
  // they save through the same numeric-defaults path and do NOT ask for I CONFIRM.
  'order_alert_min_minutes', 'order_alert_max_minutes', 'order_alert_max_repeats_cap',
];
const PCT_KEYS = ['referral_split_infra_pct', 'referral_split_l1_pct', 'referral_split_l2_pct'];

// Build the editable form state from the API `features` object: amounts → ₹.
function featFromApi(f) {
  const o = { enrolment_fee_enabled: !!f.enrolment_fee_enabled };
  TOGGLE_KEYS.forEach(([k]) => { o[k] = !!f[k]; });
  RUPEE_KEYS.forEach((k) => { o[k] = toRupees(f[k]); });
  INT_KEYS.forEach((k) => { o[k] = Number(f[k]) || 0; });
  PCT_KEYS.forEach((k) => { o[k] = Number(f[k]) || 0; });
  DEC_KEYS.forEach((k) => { o[k] = Number.isFinite(Number(f[k])) ? Number(f[k]) : 0.9; });
  o.ai_moderation_configured = !!f.ai_moderation_configured;
  return o;
}

// ---- Integrations (batch INTEG) ---------------------------------------------
// Every credential is saved through config/settings on the server (panel value
// overrides .env) and EVERY integration save goes through the typed I CONFIRM
// modal — the backend refuses the PATCH (428) without `confirm: 'I CONFIRM'`.
// Secrets are never returned by the API: the form keeps '' = "leave blank to
// keep", a typed string = new value, and null = "clear" (falls back to .env).
const SECRET_FIELDS = new Set([
  'razorpay_key_secret', 'razorpay_webhook_secret', 'whatsapp_api_token',
  'anthropic_api_key', 'meta_app_secret', 'meta_page_token', 'meta_ig_token',
  'smtp_url', 'smtp_pass', 'bhashini_api_key', 'sarvam_api_key',
]);
const FIELD_LABELS = {
  razorpay_key_id: 'Razorpay Key ID', razorpay_key_secret: 'Razorpay Key Secret', razorpay_webhook_secret: 'Razorpay Webhook Secret',
  razorpay_plan_pro: 'Razorpay Pro plan ID', razorpay_plan_family: 'Razorpay Family plan ID',
  whatsapp_api_token: 'WhatsApp access token', whatsapp_phone_number_id: 'WhatsApp Phone Number ID',
  whatsapp_business_account_id: 'WhatsApp Business Account ID', whatsapp_verify_token: 'WhatsApp verify token',
  whatsapp_template_reminder: 'WhatsApp reminder template', whatsapp_template_lang: 'WhatsApp template language',
  anthropic_api_key: 'AI API key', moderation_llm_model: 'Moderation model id', content_llm_model: 'Content model id',
  meta_app_id: 'Meta App ID', meta_app_secret: 'Meta App Secret', meta_page_token: 'Facebook Page token', meta_ig_token: 'Instagram token',
  smtp_url: 'SMTP URL', smtp_host: 'SMTP host', smtp_port: 'SMTP port', smtp_user: 'SMTP user', smtp_pass: 'SMTP password',
  smtp_secure: 'SMTP TLS (secure)', newsletter_from: 'Newsletter From address',
  bhashini_nmt: 'Neural translation (NMT)', bhashini_api_key: 'Bhashini API key', bhashini_user_id: 'Bhashini user id', sarvam_api_key: 'Sarvam API key',
};

// The PATCH body for one integration card: only fields that actually changed
// against the loaded snapshot. Secrets: '' (blank) is "keep" and is dropped;
// null is "clear"; any other string is a new value.
function integrationDiff(form, initial) {
  const body = {};
  for (const [k, v] of Object.entries(form)) {
    if (SECRET_FIELDS.has(k)) {
      if (v === null) body[k] = null;
      else if (typeof v === 'string' && v !== '') body[k] = v;
    } else if (v !== (initial ? initial[k] : undefined)) {
      body[k] = v;
    }
  }
  return body;
}

// The human-readable change list the modal shows. Secrets are never echoed.
function describeChanges(body) {
  return Object.entries(body).map(([k, v]) => {
    const label = FIELD_LABELS[k] || k;
    if (SECRET_FIELDS.has(k)) return { label, detail: v === null ? '(cleared)' : '•••• (updated)' };
    if (v === null || v === '') return { label, detail: '(cleared — falls back to .env if set)' };
    if (typeof v === 'boolean') return { label, detail: v ? 'on' : 'off' };
    return { label, detail: String(v) };
  });
}

export default function AdminSettings() {
  const router = useRouter();
  const [s, setS] = useState(null);
  const [rz, setRz] = useState({});
  const [wa, setWa] = useState({});
  const [landing, setLanding] = useState({ landing_whatsapp: '' });
  const [ai, setAi] = useState({});
  const [meta, setMeta] = useState({});
  const [smtp, setSmtp] = useState({});
  const [nmt, setNmt] = useState({});
  // Snapshots of the loaded (non-secret) values, so a save only sends what changed.
  const [initial, setInitial] = useState({});
  // The pending integration save awaiting the typed confirmation.
  const [pending, setPending] = useState(null); // { title, body, note, changes }
  const [busy, setBusy] = useState(false);
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
      hydrate(d);
      setLanding({ landing_whatsapp: (d.landing && d.landing.whatsapp) || '' });
      if (d.features) setFeat(featFromApi(d.features));
    }).catch((e) => setErr(e.message));
  }, [router]);

  // Fill every integration form from the API. Secret inputs start blank
  // ("leave blank to keep"); the snapshot records the non-secret values.
  function hydrate(d) {
    const i = d.integrations || {};
    const rzF = { razorpay_key_id: d.razorpay.key_id || '', razorpay_plan_pro: d.razorpay.plan_pro || '', razorpay_plan_family: d.razorpay.plan_family || '' };
    const waF = {
      whatsapp_phone_number_id: d.whatsapp.phone_number_id || '',
      whatsapp_business_account_id: d.whatsapp.business_account_id || '',
      whatsapp_verify_token: d.whatsapp.verify_token || '',
      whatsapp_template_reminder: d.whatsapp.template_reminder || '',
      whatsapp_template_lang: d.whatsapp.template_lang || 'en',
    };
    const aiF = { moderation_llm_model: (i.ai && i.ai.moderation_model) || '', content_llm_model: (i.ai && i.ai.content_model) || '' };
    const metaF = { meta_app_id: (i.meta && i.meta.app_id) || '' };
    const smtpF = {
      smtp_host: (i.smtp && i.smtp.host) || '', smtp_port: (i.smtp && i.smtp.port) || '',
      smtp_user: (i.smtp && i.smtp.user) || '', smtp_secure: !!(i.smtp && i.smtp.secure),
      newsletter_from: (i.smtp && i.smtp.from) || '',
    };
    const nmtF = { bhashini_nmt: !!(i.nmt && i.nmt.enabled), bhashini_user_id: (i.nmt && i.nmt.bhashini_user_id) || '' };
    setRz(rzF); setWa(waF); setAi(aiF); setMeta(metaF); setSmtp(smtpF); setNmt(nmtF);
    setInitial({ ...rzF, ...waF, ...aiF, ...metaF, ...smtpF, ...nmtF });
  }

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

  // Every INTEGRATION save (Razorpay, WhatsApp, AI, Meta, SMTP, NMT): diff the
  // form, open the typed I CONFIRM modal, and only then PATCH with confirm.
  function requestIntegrationSave(title, form, note) {
    setMsg(''); setErr('');
    const body = integrationDiff(form, initial);
    if (!Object.keys(body).length) { setMsg('Nothing to save — no values changed.'); return; }
    setPending({ title, body, note, changes: describeChanges(body) });
  }

  async function confirmIntegrationSave() {
    if (!pending) return;
    setBusy(true);
    try {
      await apiFetch('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ ...pending.body, confirm: CONFIRM_PHRASE }) });
      const fresh = await apiFetch('/api/admin/settings');
      setS(fresh);
      hydrate(fresh);
      setMsg(pending.note);
      setPending(null);
    } catch (e) {
      setErr(e.status === 428 ? 'Confirmation required — type I CONFIRM exactly.' : e.message);
    } finally { setBusy(false); }
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
      storefront_ad_free_credits_per_day_paise: toPaise(feat.storefront_ad_free_credits_per_day_paise),
      storefront_ad_free_max_days: Number(feat.storefront_ad_free_max_days),
      consumer_prepay_max_advance_paise: toPaise(feat.consumer_prepay_max_advance_paise),
      delivery_champion_fee_paise: toPaise(feat.delivery_champion_fee_paise),
    }, 'Pricing saved.');
  }

  // AI moderation thresholds: both must sit in 0.5..1.0 (the API clamps too).
  function saveAiModeration() {
    const a = Number(feat.ai_moderation_auto_approve_min);
    const h = Number(feat.ai_moderation_hold_min);
    if (!(a >= 0.5 && a <= 1) || !(h >= 0.5 && h <= 1)) { setErr('Thresholds must be between 0.5 and 1.0.'); return; }
    saveFeat({ ai_moderation_auto_approve_min: a, ai_moderation_hold_min: h }, 'AI moderation thresholds saved.');
  }

  // Repeating new-order alert bounds (batch ORDERALERT). Not credentials, so no
  // I CONFIRM — the same plain save every other feature number uses. The min must
  // not exceed the max, or every shop's cadence would clamp to a single value.
  function saveOrderAlertBounds() {
    const min = parseInt(feat.order_alert_min_minutes, 10);
    const max = parseInt(feat.order_alert_max_minutes, 10);
    const cap = parseInt(feat.order_alert_max_repeats_cap, 10);
    if (!(min >= 1) || !(max >= 1) || !(cap >= 1)) { setErr('Order-alert bounds must be whole numbers of 1 or more.'); return; }
    if (min > max) { setErr('The minimum repeat interval cannot be larger than the maximum.'); return; }
    saveFeat({
      order_alert_min_minutes: min,
      order_alert_max_minutes: max,
      order_alert_max_repeats_cap: cap,
    }, 'Order-alert bounds saved.');
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

  async function testAi() {
    setMsg(''); setErr('');
    try {
      const r = await apiFetch('/api/admin/settings/ai/test', { method: 'POST' });
      setMsg(r.ok ? `✅ AI connection works (model ${r.model}).` : r.message);
    } catch (e) {
      const m = (e.body && (e.body.message || e.body.error)) || e.message;
      setErr(`AI: ${m === 'not_configured' ? 'not configured — set the API key and the content model id first.' : m}`);
    }
  }

  async function testSmtp() {
    setMsg(''); setErr('');
    try {
      const r = await apiFetch('/api/admin/settings/smtp/test', { method: 'POST' });
      setMsg(r.ok ? `✅ ${r.message}` : r.message);
    } catch (e) {
      const m = (e.body && (e.body.message || e.body.error)) || e.message;
      setErr(`SMTP: ${m === 'not_configured' ? 'not configured — set the SMTP URL or host/port and a From address first.' : m}`);
    }
  }

  const badge = (label, on) => (
    <span className="badge" style={on ? { background: 'var(--accent)', color: '#000' } : undefined}>{label}: {on ? 'set' : 'not set'}</span>
  );
  const onBadge = (label, on, offLabel) => (
    <span className="badge" style={on ? { background: 'var(--accent)', color: '#000' } : undefined}>{on ? label : (offLabel || `not ${label}`)}</span>
  );
  // "source: environment" hint — the value is inherited from .env, so the panel
  // field is empty; a panel value would override it.
  const sourceHint = (source) => (source === 'env'
    ? <span className="badge" title="Inherited from the server .env — a value saved here overrides it">source: environment</span>
    : null);

  // A password input for a secret: never shows the value; "saved" badge when
  // set; leave blank to keep; a Clear link marks it null (cleared on save).
  function secretField({ label, field, isSet, source, placeholder, form, setForm }) {
    const v = form[field];
    const clearing = v === null;
    return (
      <div>
        <label className="muted" htmlFor={`f-${field}`}>
          {label} {isSet && <span className="badge" style={{ background: 'var(--accent)', color: '#000' }}>saved</span>} {sourceHint(source)}
        </label>
        {clearing ? (
          <p className="muted" style={{ margin: '4px 0', fontSize: 13 }}>
            Will be cleared on save. <a href="#clear" onClick={(e) => { e.preventDefault(); setForm({ ...form, [field]: '' }); }}>Undo</a>
          </p>
        ) : (
          <input id={`f-${field}`} type="password" autoComplete="new-password" value={v || ''}
            placeholder={isSet ? '•••••••• (leave blank to keep)' : placeholder}
            onChange={(e) => setForm({ ...form, [field]: e.target.value })} />
        )}
        {isSet && !clearing && (
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
            <a href="#clear" onClick={(e) => { e.preventDefault(); setForm({ ...form, [field]: null }); }}>Clear</a> the saved value
          </p>
        )}
      </div>
    );
  }
  function textField({ label, field, source, placeholder, form, setForm, inputMode }) {
    return (
      <div>
        <label className="muted" htmlFor={`f-${field}`}>{label} {sourceHint(source)}</label>
        <input id={`f-${field}`} value={form[field] == null ? '' : form[field]} placeholder={placeholder} inputMode={inputMode}
          onChange={(e) => setForm({ ...form, [field]: e.target.value })} />
      </div>
    );
  }

  const integ = s.integrations || {};
  const iAi = integ.ai || {};
  const iMeta = integ.meta || {};
  const iSmtp = integ.smtp || {};
  const iNmt = integ.nmt || {};

  return (
    <Shell>
      <ConfirmTyped
        open={!!pending}
        title={pending ? pending.title : ''}
        changes={pending ? pending.changes : []}
        busy={busy}
        onCancel={() => { if (!busy) setPending(null); }}
        onConfirm={confirmIntegrationSave}
      />
      <button className="secondary" onClick={() => router.push('/admin')} style={{ marginBottom: 12 }}>← Platform</button>
      <h1>Integration settings</h1>
      <p className="muted" style={{ fontSize: 13 }}>
        Values saved here override the server <code>.env</code> and apply immediately. Every credential change asks you to type <b>I CONFIRM</b>.
      </p>
      {msg && <div className="card" style={{ color: 'var(--accent)' }}>{msg}</div>}
      {err && <div className="card" style={{ color: 'var(--danger)' }}>{err}</div>}

      {/* Razorpay */}
      <div className="card">
        <h3>Razorpay {s.razorpay.mode && <span className="badge">{s.razorpay.mode} mode</span>}</h3>
        <p className="muted">Payment links + subscriptions. Get keys at dashboard.razorpay.com → API Keys.</p>
        <div style={{ display: 'grid', gap: 10, maxWidth: 560 }}>
          <label className="muted">Key ID</label>
          <input placeholder="rzp_live_… or rzp_test_…" value={rz.razorpay_key_id} onChange={(e) => setRz({ ...rz, razorpay_key_id: e.target.value })} />
          {secretField({ label: 'Key Secret', field: 'razorpay_key_secret', isSet: s.razorpay.key_secret_set, placeholder: 'Key secret', form: rz, setForm: setRz })}
          {secretField({ label: 'Webhook Secret', field: 'razorpay_webhook_secret', isSet: s.razorpay.webhook_secret_set, placeholder: 'Webhook secret', form: rz, setForm: setRz })}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="muted">Pro plan ID</label><input placeholder="plan_…" value={rz.razorpay_plan_pro} onChange={(e) => setRz({ ...rz, razorpay_plan_pro: e.target.value })} /></div>
            <div><label className="muted">Family plan ID</label><input placeholder="plan_…" value={rz.razorpay_plan_family} onChange={(e) => setRz({ ...rz, razorpay_plan_family: e.target.value })} /></div>
          </div>
          <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
            <button onClick={() => requestIntegrationSave('Save Razorpay settings', rz, 'Razorpay settings saved.')}>Save Razorpay</button>
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
          {secretField({ label: 'Permanent Access Token', field: 'whatsapp_api_token', isSet: s.whatsapp.api_token_set, placeholder: 'EAA…', form: wa, setForm: setWa })}
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
            <button onClick={() => requestIntegrationSave('Save WhatsApp settings', wa, 'WhatsApp settings saved.')}>Save WhatsApp</button>
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

      {/* Integrations (batch INTEG): AI, Meta, SMTP, NMT — all via config/settings */}
      <h2 id="integrations" style={{ marginTop: 24 }}>Integrations</h2>

      {/* 1. AI */}
      <div className="card" id="integrations-ai">
        <h3>
          AI (moderation &amp; content drafts){' '}
          {onBadge('moderation configured', iAi.moderation_configured, 'moderation not configured')}{' '}
          {onBadge('drafts configured', iAi.content_configured, 'drafts not configured')}
        </h3>
        <p className="muted" style={{ fontSize: 13 }}>
          One API key powers the AI moderation triage and the content-desk drafting agent. The model ids are plain strings
          from your provider — nothing is built in. Without a key + model id both features stay inert.
        </p>
        <div style={{ display: 'grid', gap: 10, maxWidth: 560 }}>
          {secretField({ label: 'API key', field: 'anthropic_api_key', isSet: iAi.api_key_set, source: iAi.api_key_source, placeholder: 'API key', form: ai, setForm: setAi })}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {textField({ label: 'Moderation model id', field: 'moderation_llm_model', source: iAi.moderation_model_source, placeholder: 'model id', form: ai, setForm: setAi })}
            {textField({ label: 'Content model id', field: 'content_llm_model', source: iAi.content_model_source, placeholder: 'model id', form: ai, setForm: setAi })}
          </div>
          <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
            <button onClick={() => requestIntegrationSave('Save AI settings', ai, 'AI settings saved.')}>Save AI</button>
            <button className="secondary" onClick={testAi}>Test connection</button>
          </div>
        </div>
      </div>

      {/* 2. Meta */}
      <div className="card" id="integrations-meta">
        <h3>
          Meta (Facebook / Instagram publishing){' '}
          {onBadge('facebook configured', iMeta.facebook_configured, 'facebook not configured')}{' '}
          {onBadge('instagram configured', iMeta.instagram_configured, 'instagram not configured')}
        </h3>
        <p className="muted" style={{ fontSize: 13 }}>
          A Meta app (App ID + App Secret) plus a long-lived Page token and an Instagram Business token. <b>Auto-post stays locked until Meta app review.</b>
        </p>
        <div style={{ display: 'grid', gap: 10, maxWidth: 560 }}>
          {textField({ label: 'App ID', field: 'meta_app_id', source: iMeta.app_id_source, placeholder: 'Meta App ID', form: meta, setForm: setMeta })}
          {secretField({ label: 'App Secret', field: 'meta_app_secret', isSet: iMeta.app_secret_set, source: iMeta.app_secret_source, placeholder: 'App secret', form: meta, setForm: setMeta })}
          {secretField({ label: 'Facebook Page token', field: 'meta_page_token', isSet: iMeta.page_token_set, source: iMeta.page_token_source, placeholder: 'EAA…', form: meta, setForm: setMeta })}
          {secretField({ label: 'Instagram token', field: 'meta_ig_token', isSet: iMeta.ig_token_set, source: iMeta.ig_token_source, placeholder: 'IGQ…', form: meta, setForm: setMeta })}
          <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
            <button onClick={() => requestIntegrationSave('Save Meta settings', meta, 'Meta settings saved.')}>Save Meta</button>
          </div>
        </div>
      </div>

      {/* 3. SMTP */}
      <div className="card" id="integrations-smtp">
        <h3>Email (SMTP newsletters) {onBadge('configured', iSmtp.configured, 'not configured')}</h3>
        <p className="muted" style={{ fontSize: 13 }}>
          Either one SMTP URL (<code>smtps://user:pass@host:465</code>) <b>or</b> host / port / user / password. A From address is always required.
        </p>
        <div style={{ display: 'grid', gap: 10, maxWidth: 560 }}>
          {secretField({ label: 'SMTP URL', field: 'smtp_url', isSet: iSmtp.url_set, source: iSmtp.url_source, placeholder: 'smtps://user:pass@smtp.example.com:465', form: smtp, setForm: setSmtp })}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            {textField({ label: 'Host', field: 'smtp_host', source: iSmtp.host_source, placeholder: 'smtp.example.com', form: smtp, setForm: setSmtp })}
            {textField({ label: 'Port', field: 'smtp_port', placeholder: '587', inputMode: 'numeric', form: smtp, setForm: setSmtp })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {textField({ label: 'User', field: 'smtp_user', placeholder: 'user', form: smtp, setForm: setSmtp })}
            {secretField({ label: 'Password', field: 'smtp_pass', isSet: iSmtp.pass_set, source: iSmtp.pass_source, placeholder: 'password', form: smtp, setForm: setSmtp })}
          </div>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="checkbox" checked={!!smtp.smtp_secure} style={{ width: 'auto' }} onChange={(e) => setSmtp({ ...smtp, smtp_secure: e.target.checked })} />
            <span>TLS from the start (secure) — port 465 is always secure</span>
          </label>
          {textField({ label: 'From address', field: 'newsletter_from', source: iSmtp.from_source, placeholder: 'news@example.com', form: smtp, setForm: setSmtp })}
          <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
            <button onClick={() => requestIntegrationSave('Save email (SMTP) settings', smtp, 'SMTP settings saved.')}>Save email</button>
            <button className="secondary" onClick={testSmtp}>Test connection</button>
          </div>
        </div>
      </div>

      {/* 4. Speech & translation */}
      <div className="card" id="integrations-nmt">
        <h3>
          Speech &amp; translation (Bhashini / Sarvam){' '}
          {iNmt.adapter_wired ? onBadge('configured', iNmt.bhashini_key_set || iNmt.sarvam_key_set, 'not configured') : <span className="badge">keys only</span>}
        </h3>
        <p className="muted" style={{ fontSize: 13 }}>
          <b>Provider adapter not wired yet — keys are stored for when it is.</b> The NMT switch turns on the translation seam
          (it returns nothing until a provider is wired), so it is safe to leave off.
        </p>
        <div style={{ display: 'grid', gap: 10, maxWidth: 560 }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="checkbox" checked={!!nmt.bhashini_nmt} style={{ width: 'auto' }} onChange={(e) => setNmt({ ...nmt, bhashini_nmt: e.target.checked })} />
            <span>Enable neural translation (NMT) {sourceHint(iNmt.enabled_source)}</span>
          </label>
          {secretField({ label: 'Bhashini API key', field: 'bhashini_api_key', isSet: iNmt.bhashini_key_set, source: iNmt.bhashini_key_source, placeholder: 'Bhashini API key', form: nmt, setForm: setNmt })}
          {textField({ label: 'Bhashini user id', field: 'bhashini_user_id', source: iNmt.bhashini_user_id_source, placeholder: 'user id', form: nmt, setForm: setNmt })}
          {secretField({ label: 'Sarvam API key', field: 'sarvam_api_key', isSet: iNmt.sarvam_key_set, source: iNmt.sarvam_key_source, placeholder: 'Sarvam API key', form: nmt, setForm: setNmt })}
          <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
            <button onClick={() => requestIntegrationSave('Save speech & translation settings', nmt, 'Speech & translation settings saved.')}>Save keys</button>
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
                  {rupeeInput('storefront_ad_free_credits_per_day_paise', 'Storefront ad-free — per day')}
                  <div>
                    <label className="muted">Storefront ad-free — max days</label>
                    <input type="number" min="1" step="1" value={feat.storefront_ad_free_max_days}
                      onChange={(e) => setFeat({ ...feat, storefront_ad_free_max_days: e.target.value })} />
                  </div>
                  {rupeeInput('consumer_prepay_max_advance_paise', 'Consumer prepay — max advance')}
                  {rupeeInput('delivery_champion_fee_paise', 'Delivery champion fee')}
                </div>
                <p className="muted" style={{ fontSize: 12 }}>
                  Promo {`₹${INR.format(feat.shop_promo_credits_per_day_paise)}`}/day · branded {`₹${INR.format(feat.branded_store_credits_per_day_paise)}`}/day · ad-free {`₹${INR.format(feat.storefront_ad_free_credits_per_day_paise)}`}/day ·
                  prepay cap {`₹${INR.format(feat.consumer_prepay_max_advance_paise)}`} · delivery {`₹${INR.format(feat.delivery_champion_fee_paise)}`}
                </p>
                <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
                  <button onClick={savePricing}>Save pricing</button>
                </div>
              </div>
            </div>

            {/* AI moderation (batch AI-MOD): the toggle lives in Feature toggles
                above; here the two confidence thresholds + whether the server is
                configured at all (the key + model id live in Integrations → AI). */}
            <div className="card">
              <h3>AI moderation</h3>
              <p className="muted" style={{ fontSize: 13 }}>
                The AI only ever auto-<b>approves</b> or <b>flags</b> (holds) a row for you — it never rejects.
                A row is auto-approved when the model says “approve” at or above the first threshold; it is flagged
                to the top of the queue when the model says “hold” at or above the second. Everything else waits for
                a human as before.
              </p>
              <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
                <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                  Server configured: <b>{iAi.moderation_configured ? 'yes' : 'no'}</b>
                  {!iAi.moderation_configured && <> — set the API key and the moderation model id in <a href="#integrations-ai">Integrations → AI</a>; the toggle is inert until then.</>}
                  {iAi.moderation_configured && <> (model <code>{iAi.moderation_model}</code> — <a href="#integrations-ai">change</a>)</>}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label className="muted">Auto-approve min confidence</label>
                    <input type="number" min="0.5" max="1" step="0.01" inputMode="decimal" value={feat.ai_moderation_auto_approve_min}
                      onChange={(e) => setFeat({ ...feat, ai_moderation_auto_approve_min: e.target.value })} />
                  </div>
                  <div>
                    <label className="muted">Hold (flag) min confidence</label>
                    <input type="number" min="0.5" max="1" step="0.01" inputMode="decimal" value={feat.ai_moderation_hold_min}
                      onChange={(e) => setFeat({ ...feat, ai_moderation_hold_min: e.target.value })} />
                  </div>
                </div>
                <p className="muted" style={{ fontSize: 12 }}>0.5 – 1.0. Raise the auto-approve threshold to publish less without a human; raise the hold threshold to flag less.</p>
                <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
                  <button onClick={saveAiModeration}>Save AI thresholds</button>
                </div>
              </div>
            </div>

            {/* Repeating new-order alert (batch ORDERALERT): the platform bounds
                every shop's own cadence is clamped to. Policy numbers, not
                credentials — saved plainly, with no typed I CONFIRM. */}
            <div className="card">
              <h3>Order alerts</h3>
              <p className="muted" style={{ fontSize: 13 }}>
                A new order keeps alerting the shop owner — in the console, in the app and on WhatsApp —
                until they mark it seen or accept it. Each shop picks its own repeat interval and repeat count;
                these are the limits those choices are clamped to, so no shop can hammer an owner every few
                seconds or nag forever.
              </p>
              <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div>
                    <label className="muted">Min repeat (minutes)</label>
                    <input type="number" min="1" max="720" step="1" inputMode="numeric" value={feat.order_alert_min_minutes}
                      onChange={(e) => setFeat({ ...feat, order_alert_min_minutes: e.target.value })} />
                  </div>
                  <div>
                    <label className="muted">Max repeat (minutes)</label>
                    <input type="number" min="1" max="720" step="1" inputMode="numeric" value={feat.order_alert_max_minutes}
                      onChange={(e) => setFeat({ ...feat, order_alert_max_minutes: e.target.value })} />
                  </div>
                  <div>
                    <label className="muted">Max repeats (cap)</label>
                    <input type="number" min="1" max="100" step="1" inputMode="numeric" value={feat.order_alert_max_repeats_cap}
                      onChange={(e) => setFeat({ ...feat, order_alert_max_repeats_cap: e.target.value })} />
                  </div>
                </div>
                <p className="muted" style={{ fontSize: 12 }}>
                  A shop may repeat no faster than every {feat.order_alert_min_minutes} min and no slower than every {feat.order_alert_max_minutes} min,
                  and always stops after at most {feat.order_alert_max_repeats_cap} reminders.
                </p>
                <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
                  <button onClick={saveOrderAlertBounds}>Save order-alert bounds</button>
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
