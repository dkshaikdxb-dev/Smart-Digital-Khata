import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../../components/Nav';
import ConfirmTyped, { CONFIRM_PHRASE } from '../../components/ConfirmTyped';
import { apiFetch } from '../../lib/api';
import { moneyAuto } from '../../lib/money';
import { contrastReport } from '../../lib/contrast';

const API = process.env.NEXT_PUBLIC_API_URL || '';

// ---- Feature flags & pricing (batch FLAGS1) --------------------------------
// The session's runtime features live in platform_settings and are edited here.
// Money is integer paise under the hood: amounts show/edit as ₹ and are ×100 on
// save. Booleans are the plain feature switches; percents are the referral split.
const toRupees = (paise) => (Math.round(Number(paise) || 0)) / 100;
const toPaise = (rupees) => Math.round((Number(rupees) || 0) * 100);
// The RUPEE_KEYS live in this form's state as RUPEES (toRupees on load), so the
// summary line converts back to paise before the shared formatter renders it.
const rs = (rupees) => moneyAuto(toPaise(rupees));

// Plain feature switches (default ON except where noted). The list is the SAVE
// group, not the layout: saveToggles builds its PATCH from every entry here, and
// switchTile draws whichever one a card asks for, so a switch can sit with the
// settings it governs without changing a byte of what gets sent.
const TOGGLE_KEYS = [
  ['voice_assistant_enabled', 'Voice assistant', 'Owner “Ask” mic — free, on-device voice help.'],
  ['social_share_enabled', 'Share poster', 'Owner “Share your shop” poster for WhatsApp / IG / FB.'],
  ['shop_promo_enabled', 'Shop promos', 'Self-serve promo campaigns a shop buys with Khata Credits.'],
  ['branded_store_enabled', 'Branded store', 'Paid branded storefront upgrade for a shop.'],
  ['consumer_prepay_enabled', 'Consumer prepay', 'Lets a customer hold a prepaid advance with a shop.'],
  ['storefront_ad_free_enabled', 'Storefront ad-free buy-out', 'Lets a shop spend Khata Credits to keep the sponsored slide off its storefront.'],
  ['ai_moderation_enabled', 'AI moderation triage', 'An AI pre-screens shop photos and owner promos: auto-approves the clearly safe, flags the unsafe to the top of the queue. Never rejects. Needs the API key + moderation model id (Integrations → AI, below).'],
  // Shop trust (batch MOD2) — its OWN switch, independent of the triage above.
  // Rendered in the Shop trust & spot checks card, with the adjustments it bends.
  // Off means every shop is judged at the plain platform bar whatever its
  // history; the history keeps being recorded either way.
  ['ai_moderation_trust_enabled', 'Shop trust for AI triage', 'Lets a shop’s own record bend its bar: a clean history auto-approves a little more easily, a rejected history a little less. Never below 75% confidence, and it never rejects. Turn OFF to judge every shop identically.'],
  // Shop availability (batch A) — the MASTER KILL-SWITCH for the whole
  // open/closed gate. Turning it off makes every shop count as open again, on
  // every surface and at order time, with no deploy. Rendered in the Shop
  // availability card, above the pause ceiling it shares a subject with.
  ['shop_hours_enabled', 'Shop open/closed gate', 'Honours each shop\u2019s open switch, daily hours, pause and holiday closures \u2014 and refuses orders to a shut shop. Turn OFF to treat every shop as open again.'],
];
// AI moderation thresholds (batch AI-MOD): decimals in 0.5..1.0, edited as-is.
const DEC_KEYS = ['ai_moderation_auto_approve_min', 'ai_moderation_hold_min'];
// Trust ADJUSTMENTS (batch MOD2): how far the auto-approve bar bends, 0..0.30.
// A different band from DEC_KEYS because these are nudges, not bars.
const ADJ_KEYS = ['ai_moderation_trust_bonus', 'ai_moderation_distrust_penalty'];
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
  // The DECISION alert (batch ALERT2): how long one "Not now" tap keeps a single
  // order quiet. A short quiet window, never a way to stop the alert. Policy,
  // not a credential — no I CONFIRM.
  'order_alert_snooze_minutes',
  // Shop availability (batch A): the ceiling on a single "pause my shop", so a
  // mis-tap can never shutter a shop indefinitely. Policy, not a credential.
  'shop_pause_max_minutes',
  // One-tap accept (batch B): the ceiling a promised ready time is clamped to.
  'order_eta_max_minutes',
  // Shop trust + post-publish spot checks (batch MOD2): how much history a shop
  // needs before trust bends its bar, and what percent of auto-approvals get a
  // human second look after they are already live.
  'ai_moderation_trust_min_items', 'ai_moderation_spot_check_pct',
];
// TEXT feature keys — edited as plain strings. `order_eta_chips` (batch B) is the
// comma-separated minute list behind the owner's three accept chips.
const TEXT_KEYS = ['order_eta_chips', 'theme_accent'];
const PCT_KEYS = ['referral_split_infra_pct', 'referral_split_l1_pct', 'referral_split_l2_pct'];

// How the feature switches are laid out now. Each switch is an outlined tile
// with its description on its own line, and the tiles go in a grid that is one
// column on a phone and two or three on a desktop; min(100%, 280px) keeps a
// track from overflowing a narrow screen. What this replaces was a single 560px
// column nine checkboxes deep, running down the middle of a wide window.
const SWITCH_GRID = { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', maxWidth: 940 };
// A two-up row of fields. Two 16px inputs side by side inside a 336px card is
// what '1fr 1fr' comes to on a 400px phone, so the row folds to one column when
// a track can no longer hold 200px.
const FIELD_PAIR = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10 };
const SWITCH_TILE = { display: 'flex', gap: 10, alignItems: 'flex-start', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' };
// A paid feature and the money it costs, in one block, so a switch and its
// price are never in two different cards.
const PRICE_BLOCK = { display: 'grid', gap: 10, alignContent: 'start' };

// Build the editable form state from the API `features` object: amounts → ₹.
function featFromApi(f) {
  const o = { enrolment_fee_enabled: !!f.enrolment_fee_enabled };
  TOGGLE_KEYS.forEach(([k]) => { o[k] = !!f[k]; });
  RUPEE_KEYS.forEach((k) => { o[k] = toRupees(f[k]); });
  INT_KEYS.forEach((k) => { o[k] = Number(f[k]) || 0; });
  PCT_KEYS.forEach((k) => { o[k] = Number(f[k]) || 0; });
  DEC_KEYS.forEach((k) => { o[k] = Number.isFinite(Number(f[k])) ? Number(f[k]) : 0.9; });
  ADJ_KEYS.forEach((k) => { o[k] = Number.isFinite(Number(f[k])) ? Number(f[k]) : 0; });
  TEXT_KEYS.forEach((k) => { o[k] = f[k] == null ? '' : String(f[k]); });
  o.ai_moderation_configured = !!f.ai_moderation_configured;
  // Read-only: how the SAVED accent measures. The panel shows a live figure for
  // whatever is being typed; this is the one the server stands behind.
  o.theme_accent_contrast = f.theme_accent_contrast || null;
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

  // Shop trust + spot-check sampling (batch MOD2). The bonus/penalty are how far
  // the bar bends, in 0..0.30 — the server clamps them too, and whatever is set
  // here the effective auto-approve bar can never drop below 0.75.
  function saveAiTrust() {
    const bonus = Number(feat.ai_moderation_trust_bonus);
    const pen = Number(feat.ai_moderation_distrust_penalty);
    const minItems = parseInt(feat.ai_moderation_trust_min_items, 10);
    const pct = parseInt(feat.ai_moderation_spot_check_pct, 10);
    if (!(bonus >= 0 && bonus <= 0.3) || !(pen >= 0 && pen <= 0.3)) { setErr('The trust bonus and penalty must be between 0 and 0.30.'); return; }
    if (!(minItems >= 0 && minItems <= 100)) { setErr('Items before trust applies must be between 0 and 100.'); return; }
    if (!(pct >= 0 && pct <= 100)) { setErr('The spot-check sample must be between 0 and 100 percent.'); return; }
    saveFeat({
      ai_moderation_trust_bonus: bonus,
      ai_moderation_distrust_penalty: pen,
      ai_moderation_trust_min_items: minItems,
      ai_moderation_spot_check_pct: pct,
    }, 'Shop trust settings saved.');
  }

  // Repeating new-order alert bounds (batch ORDERALERT). Not credentials, so no
  // I CONFIRM — the same plain save every other feature number uses. The min must
  // not exceed the max, or every shop's cadence would clamp to a single value.
  function saveOrderAlertBounds() {
    const min = parseInt(feat.order_alert_min_minutes, 10);
    const max = parseInt(feat.order_alert_max_minutes, 10);
    const cap = parseInt(feat.order_alert_max_repeats_cap, 10);
    const snooze = parseInt(feat.order_alert_snooze_minutes, 10);
    if (!(min >= 1) || !(max >= 1) || !(cap >= 1)) { setErr('Order-alert bounds must be whole numbers of 1 or more.'); return; }
    if (min > max) { setErr('The minimum repeat interval cannot be larger than the maximum.'); return; }
    if (!(snooze >= 1 && snooze <= 120)) { setErr('The snooze window must be between 1 and 120 minutes.'); return; }
    saveFeat({
      order_alert_min_minutes: min,
      order_alert_max_minutes: max,
      order_alert_max_repeats_cap: cap,
      order_alert_snooze_minutes: snooze,
    }, 'Order-alert bounds saved.');
  }

  // Shop availability (batch A): the pause ceiling. Same plain save as every
  // other feature number — no I CONFIRM, because it is policy, not a credential.
  function savePauseCeiling() {
    const n = parseInt(feat.shop_pause_max_minutes, 10);
    if (!(n >= 1)) { setErr('The pause ceiling must be a whole number of 1 minute or more.'); return; }
    saveFeat({ shop_pause_max_minutes: n }, 'Shop pause ceiling saved.');
  }

  // One-tap accept (batch B): the three coarse ready-time chips and the ceiling.
  // Not credentials, so no I CONFIRM — the same plain save every other feature
  // policy value uses. The server re-validates and answers 400 `invalid_eta_chips`;
  // this check is here only so the admin gets the reason in words, not a code.
  function saveEtaChips() {
    const max = parseInt(feat.order_eta_max_minutes, 10);
    if (!(max >= 1)) { setErr('The ready-time ceiling must be a whole number of 1 minute or more.'); return; }
    const parts = String(feat.order_eta_chips || '').split(',').map((x) => x.trim());
    const nums = parts.map((x) => (/^\d+$/.test(x) ? parseInt(x, 10) : NaN));
    if (parts.length < 1 || parts.length > 4 || nums.some((n) => !(n >= 1))) {
      setErr('Give 1 to 4 chips as whole minutes, separated by commas — for example 15,30,60.');
      return;
    }
    if (new Set(nums).size !== nums.length) { setErr('The chips must all be different.'); return; }
    if (nums.some((n) => n > max)) { setErr(`Every chip must be ${max} minutes or less.`); return; }
    saveFeat({ order_eta_chips: nums.join(','), order_eta_max_minutes: max }, 'Ready-time chips saved.');
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
          <input id={`f-${field}`} data-setting={field} type="password" autoComplete="new-password" value={v || ''}
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
        <input id={`f-${field}`} data-setting={field} value={form[field] == null ? '' : form[field]} placeholder={placeholder} inputMode={inputMode}
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
      <h1>Platform settings</h1>
      <p className="muted" style={{ fontSize: 13 }}>
        Five sections, in the order the platform works: what it connects to, what it charges, what it
        moderates, what it lets a shop do for itself, and what is not live yet.
      </p>
      <p className="muted" style={{ fontSize: 13 }}>
        <b>Feature toggles</b> —{' '}
        Turn platform features on or off. Changes read live — a save applies within a minute.
        {' '}Each switch now sits in the card with the settings it governs, and the nine of them are still
        saved as one group: the <b>Save feature toggles</b> button in any of those cards saves every one.
      </p>
      <nav aria-label="Sections" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '0 0 16px', fontSize: 13 }}>
        <a href="#integrations">Integrations</a>
        <a href="#money">Money</a>
        <a href="#moderation">Moderation</a>
        <a href="#shops">Shops &amp; orders</a>
        <a href="#appearance">Appearance</a>
        <a href="#later">Not live yet</a>
      </nav>
      {msg && <div className="card" style={{ color: 'var(--accent)' }}>{msg}</div>}
      {err && <div className="card" style={{ color: 'var(--danger)' }}>{err}</div>}

      {/* SECTION 1 — what the platform connects to (batch INTEG). Every card in this
          section saves a CREDENTIAL and goes through the typed I CONFIRM modal,
          which is why that warning now sits here rather than over the whole page:
          none of the feature policy below asks for it. */}
      <h2 id="integrations" style={{ marginTop: 24 }}>Integrations</h2>
      <p className="muted" style={{ fontSize: 13 }}>
        Values saved here override the server <code>.env</code> and apply immediately. Every credential change asks you to type <b>I CONFIRM</b>.
      </p>

      {/* 1. Razorpay */}
      <div className="card">
        <h3>Razorpay {s.razorpay.mode && <span className="badge">{s.razorpay.mode} mode</span>}</h3>
        <p className="muted">Payment links + subscriptions. Get keys at dashboard.razorpay.com → API Keys.</p>
        <div style={{ display: 'grid', gap: 10, maxWidth: 560 }}>
          <label className="muted" htmlFor="f-razorpay_key_id">Key ID</label>
          <input id="f-razorpay_key_id" data-setting="razorpay_key_id" placeholder="rzp_live_… or rzp_test_…" value={rz.razorpay_key_id} onChange={(e) => setRz({ ...rz, razorpay_key_id: e.target.value })} />
          {secretField({ label: 'Key Secret', field: 'razorpay_key_secret', isSet: s.razorpay.key_secret_set, placeholder: 'Key secret', form: rz, setForm: setRz })}
          {secretField({ label: 'Webhook Secret', field: 'razorpay_webhook_secret', isSet: s.razorpay.webhook_secret_set, placeholder: 'Webhook secret', form: rz, setForm: setRz })}
          <div style={FIELD_PAIR}>
            <div><label className="muted" htmlFor="f-razorpay_plan_pro">Pro plan ID</label><input id="f-razorpay_plan_pro" data-setting="razorpay_plan_pro" placeholder="plan_…" value={rz.razorpay_plan_pro} onChange={(e) => setRz({ ...rz, razorpay_plan_pro: e.target.value })} /></div>
            <div><label className="muted" htmlFor="f-razorpay_plan_family">Family plan ID</label><input id="f-razorpay_plan_family" data-setting="razorpay_plan_family" placeholder="plan_…" value={rz.razorpay_plan_family} onChange={(e) => setRz({ ...rz, razorpay_plan_family: e.target.value })} /></div>
          </div>
          <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
            <button onClick={() => requestIntegrationSave('Save Razorpay settings', rz, 'Razorpay settings saved.')}>Save Razorpay</button>
            <button className="secondary" onClick={testRazorpay}>Test connection</button>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>Webhook URL to paste in Razorpay → Webhooks: <code>{origin}/api/webhooks/razorpay</code></p>
        </div>
      </div>

      {/* 2. WhatsApp Cloud API */}
      <div className="card">
        <h3>WhatsApp Cloud API {badge('token', s.whatsapp.api_token_set)}</h3>
        <p className="muted">Notifications + inbound commands. From Meta → WhatsApp → API Setup.</p>
        <div style={{ display: 'grid', gap: 10, maxWidth: 560 }}>
          {secretField({ label: 'Permanent Access Token', field: 'whatsapp_api_token', isSet: s.whatsapp.api_token_set, placeholder: 'EAA…', form: wa, setForm: setWa })}
          <div style={FIELD_PAIR}>
            <div><label className="muted" htmlFor="f-whatsapp_phone_number_id">Phone Number ID</label><input id="f-whatsapp_phone_number_id" data-setting="whatsapp_phone_number_id" value={wa.whatsapp_phone_number_id} onChange={(e) => setWa({ ...wa, whatsapp_phone_number_id: e.target.value })} /></div>
            <div><label className="muted" htmlFor="f-whatsapp_business_account_id">Business Account ID</label><input id="f-whatsapp_business_account_id" data-setting="whatsapp_business_account_id" value={wa.whatsapp_business_account_id} onChange={(e) => setWa({ ...wa, whatsapp_business_account_id: e.target.value })} /></div>
          </div>
          <label className="muted" htmlFor="f-whatsapp_verify_token">Verify Token (any string; paste same in Meta webhook)</label>
          <input id="f-whatsapp_verify_token" data-setting="whatsapp_verify_token" value={wa.whatsapp_verify_token} onChange={(e) => setWa({ ...wa, whatsapp_verify_token: e.target.value })} />
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <div><label className="muted" htmlFor="f-whatsapp_template_reminder">Reminder template name</label><input id="f-whatsapp_template_reminder" data-setting="whatsapp_template_reminder" placeholder="dues_reminder" value={wa.whatsapp_template_reminder} onChange={(e) => setWa({ ...wa, whatsapp_template_reminder: e.target.value })} /></div>
            <div><label className="muted" htmlFor="f-whatsapp_template_lang">Template language</label><input id="f-whatsapp_template_lang" data-setting="whatsapp_template_lang" value={wa.whatsapp_template_lang} onChange={(e) => setWa({ ...wa, whatsapp_template_lang: e.target.value })} /></div>
          </div>
          <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
            <button onClick={() => requestIntegrationSave('Save WhatsApp settings', wa, 'WhatsApp settings saved.')}>Save WhatsApp</button>
            <button className="secondary" onClick={testWhatsapp}>Send test message</button>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>Webhook URL for Meta: <code>{origin}/api/webhooks/whatsapp</code> (subscribe to <b>messages</b>)</p>
        </div>
      </div>

      {/* 3. Public website — a landing-page number, not a Cloud API
          credential, and it saves plainly — so it is a card of its own here
          rather than one nested inside the WhatsApp card, which is where it
          used to live. */}
      <div className="card">
        <h3>Public website</h3>
        <p className="muted" style={{ fontSize: 13 }}>The “chat with us” WhatsApp number shown on the marketing landing (khata.dadashaik.com). International digits, e.g. <code>919731422995</code> — no “+”. Changes go live within a minute; leave blank to use the built-in default. This is separate from the Cloud API sender above.</p>
        <label className="muted" htmlFor="f-landing_whatsapp">Landing WhatsApp number</label>
        <input id="f-landing_whatsapp" data-setting="landing_whatsapp" inputMode="numeric" placeholder="919731422995" value={landing.landing_whatsapp} onChange={(e) => setLanding({ landing_whatsapp: e.target.value })} />
        <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
          <button onClick={() => save(landing, 'Landing settings saved.')}>Save landing</button>
        </div>
      </div>

      {/* 4. AI */}
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
          <div style={FIELD_PAIR}>
            {textField({ label: 'Moderation model id', field: 'moderation_llm_model', source: iAi.moderation_model_source, placeholder: 'model id', form: ai, setForm: setAi })}
            {textField({ label: 'Content model id', field: 'content_llm_model', source: iAi.content_model_source, placeholder: 'model id', form: ai, setForm: setAi })}
          </div>
          <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
            <button onClick={() => requestIntegrationSave('Save AI settings', ai, 'AI settings saved.')}>Save AI</button>
            <button className="secondary" onClick={testAi}>Test connection</button>
          </div>
        </div>
      </div>

      {/* 5. Meta */}
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

      {/* 6. SMTP */}
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
          <div style={FIELD_PAIR}>
            {textField({ label: 'User', field: 'smtp_user', placeholder: 'user', form: smtp, setForm: setSmtp })}
            {secretField({ label: 'Password', field: 'smtp_pass', isSet: iSmtp.pass_set, source: iSmtp.pass_source, placeholder: 'password', form: smtp, setForm: setSmtp })}
          </div>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="checkbox" data-setting="smtp_secure" checked={!!smtp.smtp_secure} style={{ width: 'auto' }} onChange={(e) => setSmtp({ ...smtp, smtp_secure: e.target.checked })} />
            <span>TLS from the start (secure) — port 465 is always secure</span>
          </label>
          {textField({ label: 'From address', field: 'newsletter_from', source: iSmtp.from_source, placeholder: 'news@example.com', form: smtp, setForm: setSmtp })}
          <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
            <button onClick={() => requestIntegrationSave('Save email (SMTP) settings', smtp, 'SMTP settings saved.')}>Save email</button>
            <button className="secondary" onClick={testSmtp}>Test connection</button>
          </div>
        </div>
      </div>

      {/* 7. Speech & translation */}
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
            <input type="checkbox" data-setting="bhashini_nmt" checked={!!nmt.bhashini_nmt} style={{ width: 'auto' }} onChange={(e) => setNmt({ ...nmt, bhashini_nmt: e.target.checked })} />
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
            <label className="muted" htmlFor={`f-${key}`}>{label} (₹)</label>
            <input id={`f-${key}`} data-setting={key} type="number" min="0" step="1" inputMode="numeric" value={feat[key]}
              onChange={(e) => setFeat({ ...feat, [key]: e.target.value })} />
            {help && <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>{help}</p>}
          </div>
        );
        // A whole-number ceiling belonging to one paid feature (its max days).
        const daysInput = (key, label) => (
          <div>
            <label className="muted" htmlFor={`f-${key}`}>{label}</label>
            <input id={`f-${key}`} data-setting={key} type="number" min="1" step="1" value={feat[key]}
              onChange={(e) => setFeat({ ...feat, [key]: e.target.value })} />
          </div>
        );
        // One feature switch, drawn as an outlined tile: a real hit area, the name
        // in bold, and the description on its own line instead of trailing off the
        // end of a row. Tiles sit in SWITCH_GRID — one column on a phone, two or
        // three on a desktop. The nine of them used to run down the middle of a
        // wide screen in a single 560px column.
        const switchTile = (key) => {
          const [, label, desc] = TOGGLE_KEYS.find(([k]) => k === key);
          return (
            <label key={key} style={SWITCH_TILE}>
              <input type="checkbox" data-setting={key} checked={!!feat[key]} style={{ width: 'auto', marginTop: 3 }}
                onChange={(e) => setFeat({ ...feat, [key]: e.target.checked })} />
              <span><b>{label}</b><br /><span className="muted" style={{ fontSize: 13 }}>{desc}</span></span>
            </label>
          );
        };
        // The nine switches are one row of platform_settings, and saveToggles still
        // sends all nine in a single PATCH built from TOGGLE_KEYS — spreading the
        // switches over several cards changed where they are shown, not what is
        // sent. So every card that shows a switch also carries that button: nobody
        // flips something here and then goes hunting for a save over there.
        const toggleNote = (
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            The feature switches save as one group: <b>Save feature toggles</b> sends all nine, from whichever card you press it in.
          </p>
        );
        return (
          <>
            {/* SECTION 2 — what the platform charges. Both cards move money, so they sit
                together, and the money-critical one keeps its danger border. */}
            <h2 id="money" style={{ marginTop: 24 }}>Money</h2>
            <p className="muted" style={{ fontSize: 13 }}>
              What the platform charges: enrolment, the referral split paid out of it, and the price of
              every paid feature a shop can buy.
            </p>

            {/* Enrolment & economics — money-critical, warning-tinted */}
            <div className="card" data-money-critical="enrolment" style={{ borderColor: 'var(--danger)' }}>
              <h3>Enrolment &amp; economics</h3>
              <p className="muted" style={{ fontSize: 13 }}>
                Money-critical. The referral split feeds the zero-burn engine — infra + L1 + L2 can never exceed 100%.
              </p>
              <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <input type="checkbox" data-setting="enrolment_fee_enabled" checked={!!feat.enrolment_fee_enabled} style={{ width: 'auto', marginTop: 3 }}
                    onChange={(e) => toggleEnrolmentMaster(e.target.checked)} />
                  <span>
                    <b>Paid enrolment {feat.enrolment_fee_enabled ? 'ON' : 'OFF'}</b>
                    <br />
                    <span style={{ fontSize: 13, color: 'var(--danger)' }}>
                      Turns on paid ₹ enrolment for new shops. New shops are charged the fee before they can start.
                    </span>
                  </span>
                </label>
                <div style={FIELD_PAIR}>
                  {rupeeInput('enrolment_fee_basic_paise', 'Basic enrolment fee')}
                  {rupeeInput('enrolment_fee_premium_paise', 'Premium enrolment fee')}
                </div>
                <label className="muted">Referral split (% of the fee)</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  {PCT_KEYS.map((key, i) => (
                    <div key={key}>
                      <label className="muted" style={{ fontSize: 12 }} htmlFor={`f-${key}`}>{['Infra', 'L1', 'L2'][i]} %</label>
                      <input id={`f-${key}`} data-setting={key} type="number" min="0" max="100" step="1" value={feat[key]}
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

            {/* Pricing (batch FLAGS1). Each paid feature's own on/off switch now
                sits directly above the price it governs — the switch says whether a
                shop may buy the thing at all, the fields say what it costs. The
                switches still save as one PATCH; see toggleNote. */}
            <div className="card">
              <h3>Pricing</h3>
              <p className="muted">Fees &amp; ceilings for the paid features. All amounts in ₹ (stored as paise).</p>
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={SWITCH_GRID}>
                  <div style={PRICE_BLOCK}>
                    {switchTile('shop_promo_enabled')}
                    {rupeeInput('shop_promo_credits_per_day_paise', 'Shop promo — per day')}
                    {daysInput('shop_promo_max_days', 'Shop promo — max days')}
                  </div>
                  <div style={PRICE_BLOCK}>
                    {switchTile('branded_store_enabled')}
                    {rupeeInput('branded_store_credits_per_day_paise', 'Branded store — per day')}
                    {daysInput('branded_store_max_days', 'Branded store — max days')}
                  </div>
                  <div style={PRICE_BLOCK}>
                    {switchTile('storefront_ad_free_enabled')}
                    {rupeeInput('storefront_ad_free_credits_per_day_paise', 'Storefront ad-free — per day')}
                    {daysInput('storefront_ad_free_max_days', 'Storefront ad-free — max days')}
                  </div>
                  <div style={PRICE_BLOCK}>
                    {switchTile('consumer_prepay_enabled')}
                    {rupeeInput('consumer_prepay_max_advance_paise', 'Consumer prepay — max advance')}
                  </div>
                  <div style={PRICE_BLOCK}>
                    {rupeeInput('delivery_champion_fee_paise', 'Delivery champion fee')}
                  </div>
                </div>
                <p className="muted" style={{ fontSize: 12 }}>
                  Promo {rs(feat.shop_promo_credits_per_day_paise)}/day · branded {rs(feat.branded_store_credits_per_day_paise)}/day · ad-free {rs(feat.storefront_ad_free_credits_per_day_paise)}/day ·
                  prepay cap {rs(feat.consumer_prepay_max_advance_paise)} · delivery {rs(feat.delivery_champion_fee_paise)}
                </p>
                <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
                  <button onClick={savePricing}>Save pricing</button>
                  <button onClick={saveToggles}>Save feature toggles</button>
                </div>
                {toggleNote}
              </div>
            </div>

            {/* SECTION 3 — what the platform moderates. The triage switch with its
                thresholds, and the trust switch with its adjustments — each pair
                in one card now, instead of one card and a distant list. */}
            <h2 id="moderation" style={{ marginTop: 24 }}>Moderation</h2>
            <p className="muted" style={{ fontSize: 13 }}>
              What the AI is allowed to decide on its own, and how much of what it publishes a human still sees.
            </p>

            {/* AI moderation (batch AI-MOD). The triage switch used to be nine
                cards away in the Feature toggles list while its two confidence
                thresholds sat here; now the switch is the first thing in the card,
                above the thresholds it governs. Whether the server is configured at
                all is still the key + model id in Integrations → AI. */}
            <div className="card">
              <h3>AI moderation</h3>
              <p className="muted" style={{ fontSize: 13 }}>
                The AI only ever auto-<b>approves</b> or <b>flags</b> (holds) a row for you — it never rejects.
                A row is auto-approved when the model says “approve” at or above the first threshold; it is flagged
                to the top of the queue when the model says “hold” at or above the second. Everything else waits for
                a human as before.
              </p>
              <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
                {switchTile('ai_moderation_enabled')}
                <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                  Server configured: <b>{iAi.moderation_configured ? 'yes' : 'no'}</b>
                  {!iAi.moderation_configured && <> — set the API key and the moderation model id in <a href="#integrations-ai">Integrations → AI</a>; the toggle is inert until then.</>}
                  {iAi.moderation_configured && <> (model <code>{iAi.moderation_model}</code> — <a href="#integrations-ai">change</a>)</>}
                </p>
                <div style={FIELD_PAIR}>
                  <div>
                    <label className="muted" htmlFor="f-ai_moderation_auto_approve_min">Auto-approve min confidence</label>
                    <input id="f-ai_moderation_auto_approve_min" data-setting="ai_moderation_auto_approve_min" type="number" min="0.5" max="1" step="0.01" inputMode="decimal" value={feat.ai_moderation_auto_approve_min}
                      onChange={(e) => setFeat({ ...feat, ai_moderation_auto_approve_min: e.target.value })} />
                  </div>
                  <div>
                    <label className="muted" htmlFor="f-ai_moderation_hold_min">Hold (flag) min confidence</label>
                    <input id="f-ai_moderation_hold_min" data-setting="ai_moderation_hold_min" type="number" min="0.5" max="1" step="0.01" inputMode="decimal" value={feat.ai_moderation_hold_min}
                      onChange={(e) => setFeat({ ...feat, ai_moderation_hold_min: e.target.value })} />
                  </div>
                </div>
                <p className="muted" style={{ fontSize: 12 }}>0.5 – 1.0. Raise the auto-approve threshold to publish less without a human; raise the hold threshold to flag less.</p>
                <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
                  <button onClick={saveAiModeration}>Save AI thresholds</button>
                  <button onClick={saveToggles}>Save feature toggles</button>
                </div>
                {toggleNote}
              </div>
            </div>

            {/* Shop trust + post-publish spot checks (batch MOD2). Its switch is
                its own, independent of the triage switch above, and it now sits in
                this card with the numbers it governs: how far trust bends the bar,
                and how much of what gets published is looked at again. */}
            <div className="card">
              <h3>Shop trust &amp; spot checks</h3>
              <p className="muted" style={{ fontSize: 13 }}>
                Each shop gets a <b>trust score from 0 to 1</b>: the share of its submitted content that was
                judged acceptable, counted as if the shop already had one approval and one rejection on file
                (so a brand-new shop sits at exactly 0.50 and one lucky approval proves nothing). A rejection
                also costs a freshness penalty of 0.30 that fades to zero over 90 days, so a <i>recent</i>
                {' '}rejection hurts more than an old one.
              </p>
              <p className="muted" style={{ fontSize: 13 }}>
                A shop scoring <b>0.85 or more</b>, with at least the number of decided items below, is
                <b> trusted</b>: its auto-approve bar drops by the bonus. A shop scoring <b>under 0.50</b>
                {' '}— worse than a brand-new shop — is <b>distrusted</b>: its bar rises by the penalty, and
                borderline flags reach you more readily. Everyone else is judged at the plain bar.
                {' '}<b>The bar never drops below 0.75</b>, whatever is set here, and the AI still never rejects.
              </p>
              <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
                {switchTile('ai_moderation_trust_enabled')}
                <div style={FIELD_PAIR}>
                  <div>
                    <label className="muted" htmlFor="f-ai_moderation_trust_bonus">Trusted shop bonus (bar drops by)</label>
                    <input id="f-ai_moderation_trust_bonus" data-setting="ai_moderation_trust_bonus" type="number" min="0" max="0.3" step="0.01" inputMode="decimal" value={feat.ai_moderation_trust_bonus}
                      onChange={(e) => setFeat({ ...feat, ai_moderation_trust_bonus: e.target.value })} />
                  </div>
                  <div>
                    <label className="muted" htmlFor="f-ai_moderation_distrust_penalty">Distrusted shop penalty (bar rises by)</label>
                    <input id="f-ai_moderation_distrust_penalty" data-setting="ai_moderation_distrust_penalty" type="number" min="0" max="0.3" step="0.01" inputMode="decimal" value={feat.ai_moderation_distrust_penalty}
                      onChange={(e) => setFeat({ ...feat, ai_moderation_distrust_penalty: e.target.value })} />
                  </div>
                  <div>
                    <label className="muted" htmlFor="f-ai_moderation_trust_min_items">Items before trust applies</label>
                    <input id="f-ai_moderation_trust_min_items" data-setting="ai_moderation_trust_min_items" type="number" min="0" max="100" step="1" inputMode="numeric" value={feat.ai_moderation_trust_min_items}
                      onChange={(e) => setFeat({ ...feat, ai_moderation_trust_min_items: e.target.value })} />
                  </div>
                  <div>
                    <label className="muted" htmlFor="f-ai_moderation_spot_check_pct">Spot-check sample (% of auto-approvals)</label>
                    <input id="f-ai_moderation_spot_check_pct" data-setting="ai_moderation_spot_check_pct" type="number" min="0" max="100" step="1" inputMode="numeric" value={feat.ai_moderation_spot_check_pct}
                      onChange={(e) => setFeat({ ...feat, ai_moderation_spot_check_pct: e.target.value })} />
                  </div>
                </div>
                <p className="muted" style={{ fontSize: 12 }}>
                  Spot checks are the safety net on auto-approval: this percentage of everything the AI
                  publishes is queued for a human second look on the Campaigns desk. Marking one “Not OK”
                  takes the item straight back down to the review queue. Set 0 to sample nothing (not advised).
                </p>
                <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
                  <button onClick={saveAiTrust}>Save trust settings</button>
                  <button onClick={saveToggles}>Save feature toggles</button>
                </div>
                {toggleNote}
              </div>
            </div>

            {/* SECTION 4 — what the platform lets a shop do for itself. */}
            <h2 id="shops" style={{ marginTop: 24 }}>Shops &amp; orders</h2>
            <p className="muted" style={{ fontSize: 13 }}>
              What a shop may do without asking anyone: shut its own doors, chase a new order, promise a
              ready time — and the free tools in the owner app.
            </p>

            {/* Shop availability (batch A). The master kill-switch for the whole
                open/closed gate now heads this card, rather than sitting in a list
                of nine while the one number it shares a subject with — the ceiling
                on a single shop pause — sat down here on its own. */}
            <div className="card">
              <h3>Shop availability</h3>
              <p className="muted" style={{ fontSize: 13 }}>
                A shopkeeper can pause their shop for a short while (&ldquo;back in 30 minutes&rdquo;) straight from Home.
                This is the longest a single pause may last, so a mis-tap can never shutter a shop indefinitely.
                A pause always expires on its own; the shop reopens with no further action.
              </p>
              <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
                {switchTile('shop_hours_enabled')}
                <div>
                  <label className="muted" htmlFor="f-shop_pause_max_minutes">Max pause (minutes)</label>
                  <input id="f-shop_pause_max_minutes" data-setting="shop_pause_max_minutes" type="number" min="1" max="43200" step="1" inputMode="numeric" value={feat.shop_pause_max_minutes}
                    onChange={(e) => setFeat({ ...feat, shop_pause_max_minutes: e.target.value })} />
                </div>
                <p className="muted" style={{ fontSize: 12 }}>
                  A single pause can last at most {feat.shop_pause_max_minutes} minutes. &ldquo;Rest of today&rdquo; is capped by this too.
                </p>
                <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
                  <button onClick={savePauseCeiling}>Save pause ceiling</button>
                  <button onClick={saveToggles}>Save feature toggles</button>
                </div>
                {toggleNote}
              </div>
            </div>

            {/* Repeating new-order alert (batch ORDERALERT): the platform bounds
                every shop's own cadence is clamped to. Policy numbers, not
                credentials — saved plainly, with no typed I CONFIRM. */}
            <div className="card">
              <h3>Order alerts</h3>
              <p className="muted" style={{ fontSize: 13 }}>
                A new order keeps alerting the shop owner — in the console, in the app and on WhatsApp —
                until they <strong>accept it or reject it</strong>. Nothing else stops it, because nothing else
                answers the customer. Each shop picks its own repeat interval and repeat count;
                these are the limits those choices are clamped to, so no shop can hammer an owner every few
                seconds or nag forever.
              </p>
              <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div>
                    <label className="muted" htmlFor="f-order_alert_min_minutes">Min repeat (minutes)</label>
                    <input id="f-order_alert_min_minutes" data-setting="order_alert_min_minutes" type="number" min="1" max="720" step="1" inputMode="numeric" value={feat.order_alert_min_minutes}
                      onChange={(e) => setFeat({ ...feat, order_alert_min_minutes: e.target.value })} />
                  </div>
                  <div>
                    <label className="muted" htmlFor="f-order_alert_max_minutes">Max repeat (minutes)</label>
                    <input id="f-order_alert_max_minutes" data-setting="order_alert_max_minutes" type="number" min="1" max="720" step="1" inputMode="numeric" value={feat.order_alert_max_minutes}
                      onChange={(e) => setFeat({ ...feat, order_alert_max_minutes: e.target.value })} />
                  </div>
                  <div>
                    <label className="muted" htmlFor="f-order_alert_max_repeats_cap">Max repeats (cap)</label>
                    <input id="f-order_alert_max_repeats_cap" data-setting="order_alert_max_repeats_cap" type="number" min="1" max="100" step="1" inputMode="numeric" value={feat.order_alert_max_repeats_cap}
                      onChange={(e) => setFeat({ ...feat, order_alert_max_repeats_cap: e.target.value })} />
                  </div>
                </div>
                <div style={{ maxWidth: 220 }}>
                  <label className="muted" htmlFor="f-order_alert_snooze_minutes">&ldquo;Not now&rdquo; snooze (minutes)</label>
                  <input id="f-order_alert_snooze_minutes" data-setting="order_alert_snooze_minutes" type="number" min="1" max="120" step="1" inputMode="numeric" value={feat.order_alert_snooze_minutes}
                    onChange={(e) => setFeat({ ...feat, order_alert_snooze_minutes: e.target.value })} />
                </div>
                <p className="muted" style={{ fontSize: 12 }}>
                  A shop may repeat no faster than every {feat.order_alert_min_minutes} min and no slower than every {feat.order_alert_max_minutes} min,
                  and always stops after at most {feat.order_alert_max_repeats_cap} reminders.
                </p>
                <p className="muted" style={{ fontSize: 12 }}>
                  The snooze is a <strong>short quiet window, not a way to stop the alert</strong>: tapping
                  &ldquo;Not now&rdquo; keeps one order quiet for {feat.order_alert_snooze_minutes} min and then it comes back,
                  because the customer still has no answer. Only accepting or rejecting ends it. (1&ndash;120 min.)
                </p>
                <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
                  <button onClick={saveOrderAlertBounds}>Save order-alert bounds</button>
                </div>
              </div>
            </div>

            {/* One-tap accept (batch B): the three coarse chips an owner taps to
                accept an order AND promise a ready time, plus the ceiling that
                promise is clamped to. Coarse on purpose — a kirana owner is not
                dispatching riders, and minute-precision would be false precision. */}
            <div className="card">
              <h3>Order ready-time chips</h3>
              <p className="muted" style={{ fontSize: 13 }}>
                When a shopkeeper accepts an order they tap one of these to tell the customer roughly when it will be
                ready. The customer is sent a clock time (&ldquo;ready by 4:45 PM&rdquo;), never &ldquo;in 30 minutes&rdquo;.
                1 to 4 chips, whole minutes, comma-separated, each no more than the ceiling.
              </p>
              <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
                <div>
                  <label className="muted" htmlFor="f-order_eta_chips">Chips (minutes, comma-separated)</label>
                  <input id="f-order_eta_chips" data-setting="order_eta_chips" type="text" inputMode="numeric" placeholder="15,30,60" value={feat.order_eta_chips}
                    onChange={(e) => setFeat({ ...feat, order_eta_chips: e.target.value })} />
                </div>
                <div>
                  <label className="muted" htmlFor="f-order_eta_max_minutes">Max ready time (minutes)</label>
                  <input id="f-order_eta_max_minutes" data-setting="order_eta_max_minutes" type="number" min="1" max="1440" step="1" inputMode="numeric" value={feat.order_eta_max_minutes}
                    onChange={(e) => setFeat({ ...feat, order_eta_max_minutes: e.target.value })} />
                </div>
                <p className="muted" style={{ fontSize: 12 }}>
                  A promise longer than {feat.order_eta_max_minutes} minutes is clamped to it. An owner can always accept
                  with no time at all, and can push the time out later with &ldquo;Need more time&rdquo;.
                </p>
                <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
                  <button onClick={saveEtaChips}>Save ready-time chips</button>
                </div>
              </div>
            </div>

            {/* The two free owner-app switches. Neither has numbers of its own,
                which is why they had nowhere to be but the old nine-deep list —
                so they get a card, rather than being the leftovers of one. */}
            <div className="card">
              <h3>Owner tools</h3>
              <p className="muted" style={{ fontSize: 13 }}>
                Free features in the owner app. Nothing is charged for either, so there is no price to
                set here — only whether a shopkeeper is offered them at all.
              </p>
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={SWITCH_GRID}>
                  {switchTile('voice_assistant_enabled')}
                  {switchTile('social_share_enabled')}
                </div>
                <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
                  <button onClick={saveToggles}>Save feature toggles</button>
                </div>
                {toggleNote}
              </div>
            </div>

            {/* SECTION 5 — what is not live yet. */}
            {/* SECTION — Appearance (batch THEME1). ONE colour: the accent the apps
                and the storefront tint their buttons, active pills and highlights
                with. The dark base, the cards and the text are NOT here, on
                purpose — an operator who can repaint the text can make the screen
                unreadable from this page with no way to see what they did. */}
            <h2 id="appearance" style={{ marginTop: 24 }}>Appearance</h2>
            <p className="muted" style={{ fontSize: 13 }}>
              The accent colour the consumer app, the shopkeeper app and the storefront
              tint with. Saved here, picked up the next time an app starts.
            </p>
            <div className="card">
              <h3>Accent colour</h3>
              {(() => {
                const typed = feat.theme_accent;
                const live = contrastReport(typed);          // what the panel measures as you type
                const saved = feat.theme_accent_contrast;    // what the server stands behind
                const swatch = live ? live.accent : '#22c55e';
                return (
                  <div style={{ display: 'grid', gap: 14, maxWidth: 620 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 200px' }}>
                        <label className="muted" htmlFor="f-theme_accent">Hex colour</label>
                        <input id="f-theme_accent" data-setting="theme_accent" type="text" inputMode="text"
                          placeholder="#22c55e" value={typed}
                          onChange={(e) => setFeat({ ...feat, theme_accent: e.target.value })} />
                      </div>
                      <input aria-label="Pick the accent colour" type="color" value={swatch}
                        style={{ width: 52, height: 40, padding: 0, border: 'none', background: 'none' }}
                        onChange={(e) => setFeat({ ...feat, theme_accent: e.target.value })} />
                    </div>

                    {/* What it will actually look like, in the two places it lands. */}
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ background: swatch, color: '#052e16', borderRadius: 10,
                        padding: '10px 18px', fontWeight: 600, fontSize: 15 }}>Pay now</span>
                      <span style={{ background: '#0f172a', color: swatch, borderRadius: 10,
                        padding: '10px 18px', fontSize: 15 }}>₹1,240 outstanding</span>
                    </div>

                    {!live && typed !== '' && (
                      <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>
                        That is not a colour. Use a hex value like #22c55e.
                      </p>
                    )}
                    {live && (
                      <div style={{ fontSize: 13, display: 'grid', gap: 4 }}>
                        <div className="muted">
                          Button label on the accent: <b style={{ fontVariantNumeric: 'tabular-nums' }}>{live.on_accent.ratio}:1</b>
                          {' '}{live.on_accent.passes_aa ? '✓' : '⚠'}
                          {'  ·  '}
                          Accent as text on the app background: <b style={{ fontVariantNumeric: 'tabular-nums' }}>{live.on_app_bg.ratio}:1</b>
                          {' '}{live.on_app_bg.passes_aa_large ? '✓' : '⚠'}
                        </div>
                        {live.warnings.map((w) => (
                          <div key={w} style={{ color: 'var(--warn, #f59e0b)' }}>⚠ {w}</div>
                        ))}
                        {live.warnings.length > 0 && (
                          <div className="muted">
                            It will still save. A shopkeeper reads this screen outdoors on a cheap phone, so this is
                            worth a second look before you do.
                          </div>
                        )}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button type="button" disabled={!live}
                        onClick={() => saveFeat({ theme_accent: feat.theme_accent }, 'Accent saved. Apps pick it up on next start.')}>
                        Save accent
                      </button>
                      <button type="button" className="secondary"
                        onClick={() => setFeat({ ...feat, theme_accent: '#22c55e' })}>
                        Reset to khata green
                      </button>
                      {saved && saved.accent !== swatch && (
                        <span className="muted" style={{ fontSize: 12 }}>
                          Saved: <code>{saved.accent}</code> — unsaved change above.
                        </span>
                      )}
                    </div>

                    <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                      A festive theme can override this for a date range — Diwali, Eid, Pongal, a sale
                      weekend. While one is live it wins, and this stays the colour underneath it.
                      {' '}<a href="/admin/theme-campaigns">Festive themes →</a>
                    </p>
                  </div>
                );
              })()}
            </div>

            <h2 id="later" style={{ marginTop: 24 }}>Not live yet</h2>
            <p className="muted" style={{ fontSize: 13 }}>
              Built, but switched off at the source and waiting on something outside this panel.
            </p>

            {/* Coming soon — inert Meta auto-post stub, always locked */}
            <div className="card">
              <h3>Coming soon</h3>
              <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', opacity: 0.6 }}>
                  <input type="checkbox" checked={false} disabled style={{ width: 'auto', marginTop: 3 }} />
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
