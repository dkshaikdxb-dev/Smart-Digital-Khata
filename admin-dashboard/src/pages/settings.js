import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Nav from '../components/Nav';
import DataSaverToggle from '../components/DataSaverToggle';
import { apiFetch } from '../lib/api';
import { useLang, LANGS } from '../lib/i18n';

// Display name for a language code (native script), for the shop-name-i18n panel.
const langName = (code) => (LANGS.find((l) => l.code === code)?.name || code);

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;

// Money is paise everywhere; the fulfillment form edits in rupees. These helpers
// convert a paise value to a rupee string for an input, and back to paise ints on
// save. Blank optionals (free above / radius / hours) are sent as null.
const paiseToRs = (p) => (p == null || p === '' ? '' : String(Number(p) / 100));
const rsToPaise = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && v !== '' ? Math.round(n * 100) : 0;
};
function fulFromShop(s) {
  return {
    offers_pickup: !!s.offers_pickup,
    offers_delivery: !!s.offers_delivery,
    delivery_fee: paiseToRs(s.delivery_fee),
    free_delivery_min: paiseToRs(s.free_delivery_min),
    delivery_min_order: paiseToRs(s.delivery_min_order),
    delivery_radius_km: s.delivery_radius_km == null ? '' : String(s.delivery_radius_km),
    delivery_hours: s.delivery_hours || '',
  };
}

export default function Settings() {
  const router = useRouter();
  const { t } = useLang();
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

  // Shop name in other languages (auto-localized; owner can override per lang).
  const [nameI18n, setNameI18n] = useState(null); // { english_name, languages[], names[] }
  const [nameEdits, setNameEdits] = useState({}); // { [lang]: string }
  const [nameI18nMsg, setNameI18nMsg] = useState('');

  function loadNameI18n() {
    apiFetch('/api/shops/me/name-i18n').then((r) => {
      setNameI18n(r);
      const edits = {};
      for (const row of r.names || []) edits[row.lang] = row.name;
      setNameEdits(edits);
    }).catch(console.error);
  }

  // Delivery & pickup (per-shop fulfillment). Edited in rupees; saved in paise.
  const [ful, setFul] = useState(null);
  const [fulMsg, setFulMsg] = useState('');

  // Store FAQ — owner-authored questions/policies shown to the shop's customers.
  const [faqs, setFaqs] = useState([]);
  const [faqForm, setFaqForm] = useState({ question: '', answer: '', sort_order: '' });
  const [faqMsg, setFaqMsg] = useState('');

  // Share your shop — consumer link + a client-side QR the owner can print and
  // stick on the counter for customers to scan.
  const [shopLink, setShopLink] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copyMsg, setCopyMsg] = useState('');

  function loadFaqs() {
    apiFetch('/api/shops/faqs').then((r) => setFaqs(r.items || [])).catch(console.error);
  }

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
    if (window.localStorage.getItem('skhata_role') === 'distributor') { router.replace('/distributor'); return; }
    apiFetch('/api/shops/me').then((r) => { setShop(r.shop); setFul(fulFromShop(r.shop)); }).catch(console.error);
    apiFetch('/api/subscriptions/plans').then((r) => setPlans(r.plans)).catch(console.error);
    apiFetch('/api/subscriptions/me').then((r) => setSub(r.subscription)).catch(console.error);
    loadPayment();
    loadFaqs();
    loadNameI18n();
  }, [router]);

  // Build the consumer link and render its QR client-side (window + the qrcode
  // package are browser-only, so this stays in an effect).
  useEffect(() => {
    if (!shop?.id || typeof window === 'undefined') return;
    const link = `${window.location.origin}/c/shop/${shop.id}`;
    setShopLink(link);
    let cancelled = false;
    (async () => {
      try {
        const QRCode = (await import('qrcode')).default;
        const url = await QRCode.toDataURL(link, { width: 240, margin: 1 });
        if (!cancelled) setQrDataUrl(url);
      } catch (e) {
        if (!cancelled) setQrDataUrl('');
      }
    })();
    return () => { cancelled = true; };
  }, [shop?.id]);

  async function copyShopLink() {
    setCopyMsg('');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shopLink);
      } else {
        const ta = document.createElement('textarea');
        ta.value = shopLink;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopyMsg(t('set.linkCopied'));
    } catch (e) {
      setCopyMsg(e.message);
    }
  }

  if (!shop) return (<div><Nav /><div className="container">{t('common.loading')}</div></div>);

  async function save() {
    setMsg('');
    try {
      const r = await apiFetch('/api/shops/me', {
        method: 'PATCH',
        body: JSON.stringify({
          name: shop.name,
          notification_mode: shop.notification_mode,
          daily_digest: shop.daily_digest !== false,
          weekly_summary: shop.weekly_summary !== false,
        }),
      });
      setShop(r.shop);
      setMsg(t('common.saved'));
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
        setBillingMsg(t('set.planAuth'));
        window.open(r.authorization_url, '_blank', 'noopener');
      } else {
        setBillingMsg(t('set.planUpdated', { code }));
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
      setPayMsg(t('set.paymentSaved'));
    } catch (e) { setPayMsg(e.message); }
  }

  async function testPayment() {
    setPayMsg('');
    try {
      const r = await apiFetch('/api/shops/me/payment/test', { method: 'POST' });
      setPayMsg(r.ok === false ? t('set.connFailed', { err: r.error || t('set.connFailedKeys') }) : t('set.connOk'));
    } catch (e) { setPayMsg(t('set.connFailed', { err: e.message })); }
  }

  async function saveDiscovery() {
    setDiscoveryMsg('');
    try {
      const r = await apiFetch('/api/shops/me', {
        method: 'PATCH',
        body: JSON.stringify({
          city: shop.city || null,
          area: shop.area || null,
          village: shop.village || null,
          pincode: shop.pincode || null,
          latitude: shop.latitude === '' || shop.latitude == null ? null : Number(shop.latitude),
          longitude: shop.longitude === '' || shop.longitude == null ? null : Number(shop.longitude),
          is_listed: !!shop.is_listed,
        }),
      });
      setShop(r.shop);
      setDiscoveryMsg(t('common.saved'));
    } catch (e) { setDiscoveryMsg(e.message); }
  }

  async function saveNameI18n(lang) {
    setNameI18nMsg('');
    const name = (nameEdits[lang] || '').trim();
    if (!name) { setNameI18nMsg(t('sfaq.needBoth')); return; }
    try {
      await apiFetch(`/api/shops/me/name-i18n/${lang}`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
      });
      loadNameI18n();
      setNameI18nMsg(t('common.saved'));
    } catch (e) { setNameI18nMsg(e.message); }
  }

  async function saveFulfillment() {
    setFulMsg('');
    try {
      const r = await apiFetch('/api/shops/me', {
        method: 'PATCH',
        body: JSON.stringify({
          offers_pickup: !!ful.offers_pickup,
          offers_delivery: !!ful.offers_delivery,
          delivery_fee: rsToPaise(ful.delivery_fee),
          free_delivery_min: ful.free_delivery_min === '' || ful.free_delivery_min == null ? null : rsToPaise(ful.free_delivery_min),
          delivery_min_order: rsToPaise(ful.delivery_min_order),
          delivery_radius_km: ful.delivery_radius_km === '' || ful.delivery_radius_km == null ? null : Number(ful.delivery_radius_km),
          delivery_hours: ful.delivery_hours && ful.delivery_hours.trim() ? ful.delivery_hours.trim() : null,
        }),
      });
      setShop(r.shop);
      setFul(fulFromShop(r.shop));
      setFulMsg(t('common.saved'));
    } catch (e) { setFulMsg(e.message); }
  }

  async function addFaq() {
    setFaqMsg('');
    const question = faqForm.question.trim();
    const answer = faqForm.answer.trim();
    if (!question || !answer) { setFaqMsg(t('sfaq.needBoth')); return; }
    try {
      const body = { question, answer };
      if (faqForm.sort_order !== '' && faqForm.sort_order != null) body.sort_order = Number(faqForm.sort_order);
      await apiFetch('/api/shops/faqs', { method: 'POST', body: JSON.stringify(body) });
      setFaqForm({ question: '', answer: '', sort_order: '' });
      loadFaqs();
      setFaqMsg(t('common.saved'));
    } catch (e) { setFaqMsg(e.message); }
  }

  async function saveFaq(f) {
    setFaqMsg('');
    try {
      await apiFetch(`/api/shops/faqs/${f.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          question: f.question,
          answer: f.answer,
          sort_order: Number(f.sort_order) || 0,
          is_active: f.is_active !== false,
        }),
      });
      loadFaqs();
      setFaqMsg(t('common.saved'));
    } catch (e) { setFaqMsg(e.message); }
  }

  async function deleteFaq(id) {
    setFaqMsg('');
    try {
      await apiFetch(`/api/shops/faqs/${id}`, { method: 'DELETE' });
      loadFaqs();
    } catch (e) { setFaqMsg(e.message); }
  }

  return (
    <div>
      <Nav />
      <div className="container">
        <h1>{t('nav.settings')}</h1>

        <div className="card" style={{ maxWidth: 520 }}>
          <h3>{t('set.shop')}</h3>
          <label className="muted">{t('set.shopName')}</label>
          <input value={shop.name} onChange={(e) => setShop({ ...shop, name: e.target.value })} />
          <div style={{ height: 12 }} />
          <label className="muted">{t('set.customerNotifications')}</label>
          <select value={shop.notification_mode} onChange={(e) => setShop({ ...shop, notification_mode: e.target.value })}>
            <option value="silent">{t('set.silent')}</option>
            <option value="smart">{t('set.smart')}</option>
            <option value="active">{t('set.active')}</option>
          </select>
          <div style={{ height: 12 }} />
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={shop.daily_digest !== false}
              onChange={(e) => setShop({ ...shop, daily_digest: e.target.checked })}
            />
            <span>{t('set.dailyDigest')}</span>
          </label>
          <div style={{ height: 12 }} />
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={shop.weekly_summary !== false}
              onChange={(e) => setShop({ ...shop, weekly_summary: e.target.checked })}
            />
            <span>{t('set.weeklySummary')}</span>
          </label>
          <div style={{ height: 16 }} />
          <button onClick={save}>{t('common.save')}</button>
          {msg && <div className="muted" style={{ marginTop: 8 }}>{msg}</div>}
        </div>

        {nameI18n && nameI18n.languages && nameI18n.languages.length > 0 && (
        <div className="card" style={{ maxWidth: 520 }}>
          <h3>{t('snl.title')}</h3>
          <p className="muted">{t('snl.desc')}</p>
          <div className="muted" style={{ marginBottom: 12 }}>
            {t('snl.english')}: <strong style={{ color: '#e2e8f0' }}>{nameI18n.english_name}</strong>
          </div>
          <div style={{ display: 'grid', gap: 14 }}>
            {nameI18n.languages.map((code) => {
              const row = (nameI18n.names || []).find((n) => n.lang === code);
              return (
                <div key={code} style={{ borderBottom: '1px solid #334155', paddingBottom: 12 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <label className="muted" style={{ margin: 0 }}>{langName(code)}</label>
                    {row && (
                      <span className="badge">{row.source === 'owner' ? t('snl.owner') : t('snl.auto')}</span>
                    )}
                    {row && row.needs_review && (
                      <span className="badge" style={{ background: '#7c2d12', color: '#fed7aa' }}>{t('snl.review')}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input
                      style={{ flex: 1 }}
                      value={nameEdits[code] ?? ''}
                      onChange={(e) => setNameEdits({ ...nameEdits, [code]: e.target.value })}
                    />
                    <button className="secondary" onClick={() => saveNameI18n(code)}>{t('snl.save')}</button>
                  </div>
                </div>
              );
            })}
          </div>
          {nameI18nMsg && <div className="muted" style={{ marginTop: 10 }}>{nameI18nMsg}</div>}
        </div>
        )}

        <div className="card" style={{ maxWidth: 520 }}>
          <h3>{t('ds.title')}</h3>
          <DataSaverToggle />
        </div>

        <div className="card" style={{ maxWidth: 520 }}>
          <h3>{t('set.shareShop')}</h3>
          <p className="muted">{t('set.shareShopDesc')}</p>
          <div className="set-qr-card">
            {qrDataUrl
              ? <img className="set-qr-img" src={qrDataUrl} alt="" width={200} height={200} />
              : <div className="set-qr-img set-qr-ph" aria-hidden="true">…</div>}
            <code className="set-qr-link">{shopLink}</code>
          </div>
          <div className="row-actions" style={{ justifyContent: 'flex-start', marginTop: 14 }}>
            <button className="secondary" onClick={copyShopLink} disabled={!shopLink}>{t('set.copyLink')}</button>
            <button className="secondary" onClick={() => window.print()} disabled={!qrDataUrl}>{t('set.print')}</button>
          </div>
          {copyMsg && <div className="muted" style={{ marginTop: 8 }}>{copyMsg}</div>}

          {/* Print-only block: only this shows on paper (see @media print). */}
          <div className="qr-print" aria-hidden="true">
            <div className="qr-print-name">{shop.name}</div>
            {qrDataUrl && <img className="qr-print-img" src={qrDataUrl} alt="" width={280} height={280} />}
            <div className="qr-print-link">{shopLink}</div>
          </div>
        </div>

        <div className="card" style={{ maxWidth: 520 }}>
          <h3>{t('sfaq.title')}</h3>
          <p className="muted">{t('sfaq.subtitle')}</p>

          {faqs.length === 0 && <div className="muted" style={{ marginBottom: 12 }}>{t('sfaq.empty')}</div>}

          <div style={{ display: 'grid', gap: 14 }}>
            {faqs.map((f, idx) => (
              <div key={f.id} style={{ borderBottom: '1px solid #334155', paddingBottom: 12 }}>
                <label className="muted">{t('sfaq.question')}</label>
                <input
                  value={f.question}
                  onChange={(e) => setFaqs(faqs.map((x, i) => (i === idx ? { ...x, question: e.target.value } : x)))}
                />
                <div style={{ height: 8 }} />
                <label className="muted">{t('sfaq.answer')}</label>
                <textarea
                  rows={3}
                  value={f.answer}
                  onChange={(e) => setFaqs(faqs.map((x, i) => (i === idx ? { ...x, answer: e.target.value } : x)))}
                />
                <div style={{ height: 8 }} />
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ width: 90 }}>
                    <label className="muted">{t('sfaq.order')}</label>
                    <input
                      type="number" min="0" step="1"
                      value={f.sort_order}
                      onChange={(e) => setFaqs(faqs.map((x, i) => (i === idx ? { ...x, sort_order: e.target.value } : x)))}
                    />
                  </div>
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="checkbox" style={{ width: 'auto' }}
                      checked={f.is_active !== false}
                      onChange={(e) => setFaqs(faqs.map((x, i) => (i === idx ? { ...x, is_active: e.target.checked } : x)))}
                    />
                    <span>{t('sfaq.active')}</span>
                  </label>
                  <div style={{ flex: 1 }} />
                  <button className="secondary" onClick={() => saveFaq(f)}>{t('sfaq.save')}</button>
                  <button className="secondary" onClick={() => deleteFaq(f.id)}>{t('sfaq.delete')}</button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16 }}>
            <label className="muted">{t('sfaq.question')}</label>
            <input value={faqForm.question} onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })} placeholder={t('sfaq.questionPlaceholder')} />
            <div style={{ height: 8 }} />
            <label className="muted">{t('sfaq.answer')}</label>
            <textarea rows={3} value={faqForm.answer} onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })} placeholder={t('sfaq.answerPlaceholder')} />
            <div style={{ height: 8 }} />
            <div style={{ width: 90 }}>
              <label className="muted">{t('sfaq.order')}</label>
              <input type="number" min="0" step="1" value={faqForm.sort_order} onChange={(e) => setFaqForm({ ...faqForm, sort_order: e.target.value })} placeholder="0" />
            </div>
            <div style={{ height: 12 }} />
            <button onClick={addFaq}>{t('sfaq.add')}</button>
          </div>
          {faqMsg && <div className="muted" style={{ marginTop: 10 }}>{faqMsg}</div>}
        </div>

        <div className="card" style={{ maxWidth: 520 }}>
          <h3>{t('set.billing')}</h3>
          <p className="muted">
            {t('set.currentPlan')} <span className="badge">{shop.plan}</span>
            {sub?.status === 'pending' && t('set.authPending')}
          </p>
          {sub?.status === 'pending' && sub.authorization_url && (
            <p><a href={sub.authorization_url} target="_blank" rel="noreferrer">{t('set.finishAuth')}</a></p>
          )}
          <div style={{ display: 'grid', gap: 10 }}>
            {plans.map((p) => (
              <div key={p.code} style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #334155', paddingBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <strong>{p.name}</strong>{' '}
                  <span className="muted">{p.price === 0 ? t('set.free') : `${fmt(p.price)}${t('set.perMonth')}`}{t('set.upTo', { n: p.limits.customers })}</span>
                </div>
                {shop.plan === p.code ? (
                  <span className="badge">{t('set.current')}</span>
                ) : (
                  <button className="secondary" onClick={() => choosePlan(p.code)}>
                    {p.price === 0 ? t('set.downgrade') : t('set.choose')}
                  </button>
                )}
              </div>
            ))}
          </div>
          {billingMsg && <div className="muted" style={{ marginTop: 10 }}>{billingMsg}</div>}
        </div>

        <div className="card" style={{ maxWidth: 520 }}>
          <h3>{t('set.payments')}</h3>
          <p className="muted">
            {t('set.mode')} <span className="badge">{pay?.mode || '—'}</span>{' '}
            <span className="badge">{pay?.key_secret_set ? t('set.keySecretSet') : t('set.noKeySecret')}</span>{' '}
            <span className="badge">{pay?.webhook_secret_set ? t('set.webhookSecretSet') : t('set.noWebhookSecret')}</span>
          </p>
          <label className="muted">{t('set.razorpayKeyId')}</label>
          <input value={payForm.razorpay_key_id} onChange={(e) => setPayForm({ ...payForm, razorpay_key_id: e.target.value })} placeholder="rzp_live_… / rzp_test_…" />
          <div style={{ height: 12 }} />
          <label className="muted">{t('set.keySecret')}</label>
          <input type="password" value={payForm.razorpay_key_secret} onChange={(e) => setPayForm({ ...payForm, razorpay_key_secret: e.target.value })} placeholder={t('set.leaveBlank')} autoComplete="new-password" />
          <div style={{ height: 12 }} />
          <label className="muted">{t('set.webhookSecret')}</label>
          <input type="password" value={payForm.razorpay_webhook_secret} onChange={(e) => setPayForm({ ...payForm, razorpay_webhook_secret: e.target.value })} placeholder={t('set.leaveBlank')} autoComplete="new-password" />
          <div style={{ height: 16 }} />
          <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
            <button onClick={savePayment}>{t('set.savePayment')}</button>
            <button className="secondary" onClick={testPayment}>{t('set.testConnection')}</button>
          </div>
          {pay?.webhook_url && (
            <div style={{ marginTop: 14 }}>
              <div className="muted">{t('set.webhookHint')}</div>
              <code style={{ display: 'block', wordBreak: 'break-all', marginTop: 4, padding: '8px 10px', borderRadius: 8, background: '#0b1220', border: '1px solid #334155' }}>{pay.webhook_url}</code>
            </div>
          )}
          {payMsg && <div className="muted" style={{ marginTop: 10 }}>{payMsg}</div>}
        </div>

        <div className="card" style={{ maxWidth: 520 }}>
          <h3>{t('set.discovery')}</h3>
          <p className="muted">{t('set.discoveryDesc')}</p>
          <label className="muted">{t('set.city')}</label>
          <input value={shop.city || ''} onChange={(e) => setShop({ ...shop, city: e.target.value })} placeholder={t('set.city')} />
          <div style={{ height: 12 }} />
          <label className="muted">{t('set.areaLocality')}</label>
          <input value={shop.area || ''} onChange={(e) => setShop({ ...shop, area: e.target.value })} placeholder={t('set.areaPlaceholder')} />
          <div style={{ height: 12 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="muted">{t('set.village')}</label>
              <input value={shop.village || ''} onChange={(e) => setShop({ ...shop, village: e.target.value })} placeholder={t('set.village')} />
            </div>
            <div>
              <label className="muted">{t('set.pincode')}</label>
              <input value={shop.pincode || ''} onChange={(e) => setShop({ ...shop, pincode: e.target.value })} placeholder={t('set.pincode')} />
            </div>
          </div>
          <div style={{ height: 12 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="muted">{t('set.latitude')}</label>
              <input type="number" step="any" value={shop.latitude ?? ''} onChange={(e) => setShop({ ...shop, latitude: e.target.value })} placeholder="e.g. 19.0760" />
            </div>
            <div>
              <label className="muted">{t('set.longitude')}</label>
              <input type="number" step="any" value={shop.longitude ?? ''} onChange={(e) => setShop({ ...shop, longitude: e.target.value })} placeholder="e.g. 72.8777" />
            </div>
          </div>
          <div style={{ height: 12 }} />
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={!!shop.is_listed} onChange={(e) => setShop({ ...shop, is_listed: e.target.checked })} />
            <span>{t('set.listShop')}</span>
          </label>
          <div style={{ height: 16 }} />
          <button onClick={saveDiscovery}>{t('common.save')}</button>
          {discoveryMsg && <div className="muted" style={{ marginTop: 8 }}>{discoveryMsg}</div>}
        </div>

        {ful && (
        <div className="card" style={{ maxWidth: 520 }}>
          <h3>{t('set.deliveryPickup')}</h3>
          <p className="muted">{t('set.deliveryPickupDesc')}</p>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={!!ful.offers_pickup} onChange={(e) => setFul({ ...ful, offers_pickup: e.target.checked })} />
            <span>{t('set.offerPickup')}</span>
          </label>
          <div style={{ height: 10 }} />
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={!!ful.offers_delivery} onChange={(e) => setFul({ ...ful, offers_delivery: e.target.checked })} />
            <span>{t('set.offerDelivery')}</span>
          </label>

          {ful.offers_delivery && (
            <div style={{ marginTop: 14 }}>
              <label className="muted">{t('set.deliveryFee')}</label>
              <input type="number" min="0" step="any" value={ful.delivery_fee} onChange={(e) => setFul({ ...ful, delivery_fee: e.target.value })} placeholder="0" />
              <div style={{ height: 12 }} />
              <label className="muted">{t('set.freeDeliveryAbove')}</label>
              <input type="number" min="0" step="any" value={ful.free_delivery_min} onChange={(e) => setFul({ ...ful, free_delivery_min: e.target.value })} placeholder={t('set.freeDeliveryHint')} />
              <div style={{ height: 12 }} />
              <label className="muted">{t('set.minOrderDelivery')}</label>
              <input type="number" min="0" step="any" value={ful.delivery_min_order} onChange={(e) => setFul({ ...ful, delivery_min_order: e.target.value })} placeholder="0" />
              <div style={{ height: 12 }} />
              <label className="muted">{t('set.deliveryRadius')}</label>
              <input type="number" min="0" step="any" value={ful.delivery_radius_km} onChange={(e) => setFul({ ...ful, delivery_radius_km: e.target.value })} placeholder={t('set.deliveryRadiusHint')} />
              <div style={{ height: 12 }} />
              <label className="muted">{t('set.deliveryHours')}</label>
              <input value={ful.delivery_hours} onChange={(e) => setFul({ ...ful, delivery_hours: e.target.value })} placeholder={t('set.deliveryHoursPlaceholder')} />
            </div>
          )}
          <div style={{ height: 16 }} />
          <button onClick={saveFulfillment}>{t('common.save')}</button>
          {fulMsg && <div className="muted" style={{ marginTop: 8 }}>{fulMsg}</div>}
        </div>
        )}
      </div>
    </div>
  );
}
