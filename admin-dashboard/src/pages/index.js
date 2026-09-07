import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { LANGS, COPY } from '../landing-copy';
import { captureAttribution, track } from '../lib/analytics';

// Public marketing landing shown at the site root to logged-OUT visitors.
// A logged-in user never sees this: on mount we check localStorage and send
// owners/staff to /dashboard and platform admins to /admin. The owner dashboard
// itself now lives at /dashboard (see pages/dashboard.js).
//
// The page carries its own copy (as approved in the concept) — a deliberate,
// self-contained marketing surface that does NOT use the app i18n system. All
// visible strings live in ../landing-copy.js (COPY[lang][key]) so the visitor can
// switch between English and nine Indian languages from the nav. English stays
// intentionally code-switched (including the hero); every other language renders
// the page fully in that language. Both light and dark themes render from the
// token structure below.

// WhatsApp CTA target. The number is editable at runtime from Admin → Settings
// (served by GET /api/public/config); until that loads — or if it's unset or the
// request fails — we use this built-in default, so the button always works.
// NEXT_PUBLIC_WHATSAPP still overrides the default at build time.
const DEFAULT_WA_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP || '919731422995';

// Android install links for the two apps. Build URLs change with every EAS build,
// so ops can swap them at runtime from Admin → Settings (served by
// GET /api/public/config); until that loads — or if it's unset or the request
// fails — these built-in defaults hold, so the buttons always work.
// NEXT_PUBLIC_APK_* still override the defaults at build time.
const APK_CONSUMER = process.env.NEXT_PUBLIC_APK_CONSUMER || 'https://expo.dev/accounts/dkshaikdxb/projects/smart-khata-consumer/builds/9214b2a0-e9e9-4924-b198-b3affea489a5';
const APK_OWNER = process.env.NEXT_PUBLIC_APK_OWNER || 'https://expo.dev/accounts/dkshaikdxb/projects/smart-khata-owner/builds/8dc95f72-e111-460a-a741-12266870740b';
const WA_TEXT = encodeURIComponent('नमस्ते! मुझे Smart Digital Khata शुरू करना है।');
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const buildWA = (number) =>
  number ? 'https://wa.me/' + number + '?text=' + WA_TEXT : '/register';

const LANG_KEY = 'skhata_landing_lang';

// Renders a copy string, turning the lightweight inline tokens carried in the
// dictionary into real React nodes — no dangerouslySetInnerHTML. Supported:
// [b]..[/b] bold, [em]..[/em] emphasis, [dn]..[/dn] a Devanagari accent span
// (the code-switched EN hero), [link]..[/link] the "already live" link, and
// [br] a hard line break.
function Rich({ text }) {
  const parts = String(text == null ? '' : text).split('[br]');
  const out = [];
  parts.forEach((part, pi) => {
    if (pi > 0) out.push(<br key={'br' + pi} />);
    const re = /\[(b|em|dn|link)\]([\s\S]*?)\[\/\1\]/g;
    let last = 0;
    let m;
    let i = 0;
    while ((m = re.exec(part)) !== null) {
      if (m.index > last) out.push(part.slice(last, m.index));
      const key = pi + '-' + i;
      i += 1;
      if (m[1] === 'b') out.push(<b key={key}>{m[2]}</b>);
      else if (m[1] === 'em') out.push(<em key={key}>{m[2]}</em>);
      else if (m[1] === 'dn') out.push(<span className="devnag" key={key}>{m[2]}</span>);
      else out.push(<a className="link" href="/" key={key}>{m[2]}</a>);
      last = m.index + m[0].length;
    }
    if (last < part.length) out.push(part.slice(last));
  });
  return <>{out}</>;
}

export default function Home() {
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(true);
  const [lang, setLang] = useState('en');
  const [menuOpen, setMenuOpen] = useState(false);
  const [wa, setWa] = useState(buildWA(DEFAULT_WA_NUMBER));
  const [apkConsumer, setApkConsumer] = useState(APK_CONSUMER);
  const [apkOwner, setApkOwner] = useState(APK_OWNER);
  const menuRef = useRef(null);

  // Copy lookup for the active language, falling back to English if a key is
  // ever missing (it never is — key parity is asserted) so the UI never blanks.
  const t = (k) => (COPY[lang] && COPY[lang][k] != null ? COPY[lang][k] : COPY.en[k]);
  const dir = lang === 'ur' ? 'rtl' : 'ltr';
  const current = LANGS.find((l) => l.code === lang) || LANGS[0];

  function chooseLang(code) {
    setLang(code);
    try { window.localStorage.setItem(LANG_KEY, code); } catch (_) { /* ignore */ }
    setMenuOpen(false);
  }

  // Restore the visitor's stored language preference (default: English).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const v = window.localStorage.getItem(LANG_KEY);
      if (v && COPY[v]) setLang(v);
    } catch (_) { /* ignore */ }
  }, []);

  // Close the language menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return undefined;
    function onDoc(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); }
    function onKey(e) { if (e.key === 'Escape') setMenuOpen(false); }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // Newsletter subscribe (Batch T). Double opt-in: POST /subscribe records a
  // pending subscriber and (when SMTP is configured server-side) e-mails a
  // confirmation link. The response is always generic — we just show a
  // "check your inbox" message and never learn whether the address existed.
  const [nlEmail, setNlEmail] = useState('');
  const [nlList, setNlList] = useState('community');
  const [nlStatus, setNlStatus] = useState('idle'); // idle | sending | done | error

  async function submitSubscribe(e) {
    e.preventDefault();
    const email = nlEmail.trim();
    if (!email) return;
    setNlStatus('sending');
    try {
      const r = await fetch(`${API_BASE}/api/public/newsletter/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, list: nlList }),
      });
      if (!r.ok && r.status !== 202) throw new Error('failed');
      setNlStatus('done');
      setNlEmail('');
    } catch (_) {
      setNlStatus('error');
    }
  }

  // First-party analytics: capture first-touch attribution (UTM + referrer) and
  // record the landing view once on mount. Client-only; all failures swallowed.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      captureAttribution();
      track('landing_view');
    } catch (_) { /* analytics must never break the page */ }
  }, []);

  // Pull the admin-configured landing WhatsApp number at runtime; keep the
  // built-in default if it's unset or the request fails (never break the CTA).
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/public/config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const n = d && d.landing_whatsapp ? String(d.landing_whatsapp).replace(/\D/g, '') : '';
        if (!cancelled && n) setWa(buildWA(n));
        if (!cancelled && d && d.landing_apk_consumer) setApkConsumer(String(d.landing_apk_consumer));
        if (!cancelled && d && d.landing_apk_owner) setApkOwner(String(d.landing_apk_owner));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Client-only auth check. A logged-in visitor is bounced to their app so the
  // marketing page is only ever shown to logged-out visitors.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let token = null;
    try { token = window.localStorage.getItem('skhata_token'); } catch (_) { token = null; }
    if (token) {
      let role = null;
      try { role = window.localStorage.getItem('skhata_role'); } catch (_) { role = null; }
      const dest = role === 'admin'
        ? '/admin'
        : (role === 'distributor' ? '/distributor' : '/dashboard');
      router.replace(dest);
      return;
    }
    setRedirecting(false);
  }, [router]);

  if (redirecting) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#6B5A45', fontFamily: 'system-ui, sans-serif' }}>
        <span>…</span>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Smart Digital Khata — digital khata for every shop</title>
        <meta
          name="description"
          content="A digital udhaar ledger, WhatsApp reminders that collect faster, and an online shopfront — in your language, on any phone, free to start. Made for India's town and village kirana shops."
        />
        <meta property="og:title" content="Smart Digital Khata — digital khata for every shop" />
        <meta
          property="og:description"
          content="A digital udhaar ledger, WhatsApp reminders that collect faster, and an online shopfront — in your language, on any phone, free to start."
        />
        <meta property="og:type" content="website" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Mukta:wght@400;500;600;700&display=swap"
        />
      </Head>

      <div dir={dir} className="page">
        <header>
          <nav className="nav">
            <div className="brand"><span className="mark">ख</span> Smart Digital Khata</div>
            <div className="nav-cta">
              <div className="langmenu" ref={menuRef}>
                <button
                  type="button"
                  className="langpill"
                  aria-haspopup="listbox"
                  aria-expanded={menuOpen}
                  aria-label={t('langMenuLabel')}
                  onClick={() => setMenuOpen((v) => !v)}
                >
                  <span className="globe" aria-hidden="true">🌐</span>
                  <span lang={current.code}>{current.label}</span>
                  <span className="caret" aria-hidden="true">▾</span>
                </button>
                {menuOpen && (
                  <ul className="langlist" role="listbox" aria-label={t('langMenuLabel')}>
                    {LANGS.map((l) => (
                      <li key={l.code} role="option" aria-selected={l.code === lang}>
                        <button
                          type="button"
                          className={'langopt' + (l.code === lang ? ' active' : '')}
                          onClick={() => chooseLang(l.code)}
                          lang={l.code}
                        >
                          <span>{l.label}</span>
                          {l.code === lang && <span className="ok" aria-hidden="true">✓</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <a href="/login" className="btn btn-ghost">{t('navSignIn')}</a>
              <a href="/register" className="btn btn-green">{t('navStartFree')}</a>
            </div>
          </nav>
        </header>

        <main className="wrap">
          {/* HERO */}
          <section className="hero" style={{ borderTop: 0 }}>
            <div>
              <span className="flag"><span className="bars" /> {t('heroFlag')}</span>
              <h1><Rich text={t('heroH1')} /></h1>
              <p className="sub"><Rich text={t('heroSub')} /></p>
              <div className="cta">
                <a href={wa} className="btn btn-wa">{t('ctaWa')}</a>
                <a href="/register" className="btn btn-green">{t('ctaSignup')}</a>
              </div>
              <div className="trust">
                <span><Rich text={t('trust2g')} /></span><span className="d">·</span>
                <span><Rich text={t('trustLangs')} /></span><span className="d">·</span>
                <span>{t('trustNoPc')}</span><span className="d">·</span>
                <span><Rich text={t('trustFree')} /></span>
              </div>
            </div>
            <div className="phone" aria-label="The Khata app: a customer's udhaar and a WhatsApp reminder">
              <div className="scr">
                <div className="bar"><span>9:41</span><span>📶 2G · ▮▮▮</span></div>
                <div className="title">{t('phTitle')}</div>
                <div className="row"><div><div className="nm">{t('phName1')}</div><div className="ph">+91 98765 •••01</div></div><div className="amt owe">{t('phAmt1')}</div></div>
                <div className="row"><div><div className="nm">{t('phName2')}</div><div className="ph">+91 98765 •••02</div></div><div className="amt paid">{t('phAmt2')}</div></div>
                <div className="wabubble">{t('phBubble')}<span className="t">{t('phSent')}</span></div>
              </div>
            </div>
          </section>

          {/* PROBLEM */}
          <section>
            <div className="center">
              <span className="eyebrow">{t('probEyebrow')}</span>
              <h2 style={{ marginTop: 12 }}><Rich text={t('probH2')} /></h2>
              <p className="lede">{t('probLede')}</p>
            </div>
          </section>

          {/* COST OF MANUAL WORK */}
          <section>
            <div className="center">
              <span className="eyebrow">{t('costEyebrow')}</span>
              <h2 style={{ marginTop: 12 }}><Rich text={t('costH2')} /></h2>
              <p className="lede">{t('costLede')}</p>
            </div>
            <div className="costgrid">
              <div className="cost">
                <div className="big">{t('cost1Big')}</div>
                <div className="cl"><Rich text={t('cost1Cl')} /></div>
              </div>
              <div className="cost">
                <div className="big">{t('cost2Big')}</div>
                <div className="cl">{t('cost2Cl')}</div>
              </div>
              <div className="cost">
                <div className="big">{t('cost3Big')}</div>
                <div className="cl">{t('cost3Cl')}</div>
              </div>
            </div>
            <p className="illus">{t('costIllus')}</p>
          </section>

          {/* PILLARS */}
          <section>
            <div className="center"><span className="eyebrow">{t('pillEyebrow')}</span><h2 style={{ marginTop: 12 }}>{t('pillH2')}</h2></div>
            <div className="pillars">
              <div className="pill">
                <div className="ic">📗</div>
                <h3>{t('pill1H3')}</h3>
                <p>{t('pill1P')}</p>
                <div className="k">{t('pill1K')}</div>
              </div>
              <div className="pill">
                <div className="ic">🛒</div>
                <h3>{t('pill2H3')}</h3>
                <p>{t('pill2P')}</p>
                <div className="k">{t('pill2K')}</div>
              </div>
              <div className="pill">
                <div className="ic">🗣️</div>
                <h3>{t('pill3H3')}</h3>
                <p>{t('pill3P')}</p>
                <div className="k">{t('pill3K')}</div>
              </div>
            </div>
          </section>

          {/* POSITIONING BAND */}
          <section>
            <div className="band">
              <div>
                <span className="eyebrow" style={{ color: '#eafff0' }}>{t('bandEyebrow')}</span>
                <h2 style={{ marginTop: 10 }}><Rich text={t('bandH2')} /></h2>
                <p className="q">{t('bandQ')}</p>
              </div>
              <div className="stats">
                <div className="stat"><b>{t('bandStat1B')}</b><span>{t('bandStat1S')}</span></div>
                <div className="stat"><b>{t('bandStat2B')}</b><span>{t('bandStat2S')}</span></div>
                <div className="stat"><b>{t('bandStat3B')}</b><span>{t('bandStat3S')}</span></div>
                <div className="stat"><b>{t('bandStat4B')}</b><span>{t('bandStat4S')}</span></div>
              </div>
            </div>
          </section>

          {/* LOCAL ECONOMY / EMPOWERMENT */}
          <section>
            <div className="center">
              <span className="eyebrow">{t('econEyebrow')}</span>
              <h2 style={{ marginTop: 12 }}><Rich text={t('econH2')} /></h2>
              <p className="lede">{t('econLede')}</p>
            </div>
            <div className="econ">
              <div className="ec"><div className="ei">🏘️</div><h3>{t('ec1H3')}</h3><p>{t('ec1P')}</p></div>
              <div className="ec"><div className="ei">🔄</div><h3>{t('ec2H3')}</h3><p>{t('ec2P')}</p></div>
              <div className="ec"><div className="ei">🗣️</div><h3>{t('ec3H3')}</h3><p>{t('ec3P')}</p></div>
              <div className="ec"><div className="ei">🛡️</div><h3>{t('ec4H3')}</h3><p>{t('ec4P')}</p></div>
            </div>
            <p className="econ-line">{t('econLine')}</p>
          </section>

          {/* STEPS */}
          <section>
            <div className="center"><span className="eyebrow">{t('stepsEyebrow')}</span><h2 style={{ marginTop: 12 }}>{t('stepsH2')}</h2></div>
            <div className="steps">
              <div className="step"><div className="n">01</div><h3>{t('step1H3')}</h3><p>{t('step1P')}</p></div>
              <div className="step"><div className="n">02</div><h3>{t('step2H3')}</h3><p>{t('step2P')}</p></div>
              <div className="step"><div className="n">03</div><h3>{t('step3H3')}</h3><p>{t('step3P')}</p></div>
            </div>
          </section>

          {/* LANGUAGES */}
          <section>
            <div className="center">
              <span className="eyebrow">{t('langEyebrow')}</span>
              <h2 style={{ marginTop: 12 }}>{t('langH2')}</h2>
              <p className="lede">{t('langLede')}</p>
            </div>
            <div className="langs">
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  className={'lang' + (l.code === lang ? ' active' : '')}
                  onClick={() => chooseLang(l.code)}
                  lang={l.code}
                  aria-pressed={l.code === lang}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <div className="values">
              <div className="val"><span className="c">✓</span><div><b>{t('val1B')}</b> <span>{t('val1S')}</span></div></div>
              <div className="val"><span className="c">✓</span><div><b>{t('val2B')}</b> <span>{t('val2S')}</span></div></div>
              <div className="val"><span className="c">✓</span><div><b>{t('val3B')}</b> <span>{t('val3S')}</span></div></div>
              <div className="val"><span className="c">✓</span><div><b>{t('val4B')}</b> <span>{t('val4S')}</span></div></div>
            </div>
          </section>

          {/* GET THE APP */}
          <section>
            <div className="center">
              <span className="eyebrow">{t('getEyebrow')}</span>
              <h2 style={{ marginTop: 12 }}>{t('getH2')}</h2>
              <p className="lede">{t('getLede')}</p>
            </div>
            <div className="getapp">
              <div className="getcard">
                <div className="ic">📱</div>
                <h3>{t('getCustT')}</h3>
                <p>{t('getCustP')}</p>
                <a href={apkConsumer} target="_blank" rel="noopener noreferrer" className="btn btn-green" onClick={() => { try { track('get_app_click', { app: 'consumer' }); } catch (_) { /* ignore */ } }}>{t('getCustBtn')}</a>
              </div>
              <div className="getcard">
                <div className="ic">📱</div>
                <h3>{t('getShopT')}</h3>
                <p>{t('getShopP')}</p>
                <a href={apkOwner} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" onClick={() => { try { track('get_app_click', { app: 'owner' }); } catch (_) { /* ignore */ } }}>{t('getShopBtn')}</a>
              </div>
            </div>
            <p className="getnote">{t('getNote')}</p>
          </section>

          {/* NEWSLETTER */}
          <section id="newsletter">
            <div className="nlcard">
              <div>
                <span className="eyebrow">{t('nlEyebrow')}</span>
                <h2 style={{ marginTop: 10 }}>{t('nlH2')}</h2>
                <p className="lede" style={{ marginTop: 10 }}>{t('nlLede')}</p>
              </div>
              {nlStatus === 'done' ? (
                <div className="nldone" role="status">
                  <span className="tick">✓</span>
                  <div>
                    <b>{t('nlDoneT')}</b>
                    <span>{t('nlDoneS')}</span>
                  </div>
                </div>
              ) : (
                <form className="nlform" onSubmit={submitSubscribe}>
                  <div className="nlrow">
                    <input
                      type="email"
                      required
                      value={nlEmail}
                      onChange={(e) => setNlEmail(e.target.value)}
                      placeholder={t('nlPlaceholder')}
                      aria-label={t('nlAriaEmail')}
                      className="nlinput"
                    />
                    <select
                      value={nlList}
                      onChange={(e) => setNlList(e.target.value)}
                      aria-label={t('nlAriaList')}
                      className="nlselect"
                    >
                      <option value="community">{t('nlOptCommunity')}</option>
                      <option value="ecosystem">{t('nlOptEcosystem')}</option>
                    </select>
                    <button type="submit" className="btn btn-green" disabled={nlStatus === 'sending'}>
                      {nlStatus === 'sending' ? t('nlSending') : t('nlSubmit')}
                    </button>
                  </div>
                  {nlStatus === 'error' && (
                    <p className="nlerr">{t('nlError')}</p>
                  )}
                  <p className="nlnote">{t('nlNote')}</p>
                </form>
              )}
            </div>
          </section>

          {/* FINAL CTA */}
          <section id="start">
            <div className="final">
              <span className="eyebrow">{t('finalEyebrow')}</span>
              <h2 style={{ marginTop: 12 }}>{t('finalH2')}</h2>
              <p className="lede" style={{ maxWidth: '52ch', marginInline: 'auto' }}>{t('finalLede')}</p>
              <div className="cta">
                <a href={wa} className="btn btn-wa">{t('ctaWa')}</a>
                <a href="/register" className="btn btn-green">{t('ctaSignup')}</a>
              </div>
              <p className="note"><Rich text={t('finalNote')} /></p>
            </div>
          </section>
        </main>

        <footer className="wrap">
          <div className="foot">
            <div className="brand"><span className="mark">ख</span> Smart Digital Khata</div>
            <div>{t('footTagline')}</div>
            <div className="footlinks">
              <a href="/blog" className="footlink">{t('footBlog')}</a>
              <span>{t('footCopy')}</span>
            </div>
          </div>
        </footer>
      </div>

      <style jsx global>{`
        :root{
          --paper:#F7F0E1;
          --paper-2:#EFE6D2;
          --card:#FFFDF7;
          --ink:#2A1E12;
          --ink-soft:#6B5A45;
          --line:#E0D3B8;
          --green:#1C7A45;
          --green-deep:#125832;
          --haldi:#E39B24;
          --red:#C0392B;
          --red-bg:#F3DED9;
          --green-bg:#DBEDDF;
          --shadow:0 1px 2px rgba(42,30,18,.06),0 18px 40px -20px rgba(42,30,18,.28);
          --radius:16px;
          --maxw:1120px;
          --disp:'Fraunces',Georgia,serif;
          --sans:'Mukta','Segoe UI',system-ui,sans-serif;
        }
        @media (prefers-color-scheme:dark){
          :root:not([data-theme="light"]){
            --paper:#14100A; --paper-2:#1B1610; --card:#201A11; --ink:#F1E9D8; --ink-soft:#B6A588;
            --line:#332A1D; --green:#3FB56E; --green-deep:#8FE0AC; --haldi:#F0B24C; --red:#E8756A;
            --red-bg:#37211D; --green-bg:#16311F;
            --shadow:0 1px 2px rgba(0,0,0,.5),0 22px 50px -22px rgba(0,0,0,.7);
          }
        }
        :root[data-theme="dark"]{
          --paper:#14100A; --paper-2:#1B1610; --card:#201A11; --ink:#F1E9D8; --ink-soft:#B6A588;
          --line:#332A1D; --green:#3FB56E; --green-deep:#8FE0AC; --haldi:#F0B24C; --red:#E8756A;
          --red-bg:#37211D; --green-bg:#16311F;
          --shadow:0 1px 2px rgba(0,0,0,.5),0 22px 50px -22px rgba(0,0,0,.7);
        }
        *{box-sizing:border-box}
        html{scroll-behavior:smooth}
        body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.6;
          -webkit-font-smoothing:antialiased}
        .wrap{max-width:var(--maxw);margin:0 auto;padding:0 22px}
        h1,h2,h3{font-family:var(--disp);font-weight:600;line-height:1.08;margin:0;text-wrap:balance;
          letter-spacing:-.005em}
        .hi{font-family:var(--sans);font-weight:700}
        p{margin:0}
        a{color:inherit}
        .eyebrow{font-size:.72rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--green-deep)}

        header{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--paper) 88%,transparent);
          backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
        .nav{display:flex;align-items:center;justify-content:space-between;padding:12px 22px;max-width:var(--maxw);margin:0 auto;gap:14px}
        .brand{display:flex;align-items:center;gap:10px;font-family:var(--disp);font-weight:700;font-size:1.12rem}
        .mark{width:30px;height:30px;border-radius:8px;background:linear-gradient(150deg,var(--green),var(--green-deep));
          display:grid;place-items:center;color:#fff;font-family:var(--disp);font-weight:700;font-size:1rem;box-shadow:var(--shadow)}
        .nav-cta{display:flex;gap:8px;align-items:center}
        .btn{font-family:var(--sans);font-weight:700;font-size:.95rem;border-radius:999px;padding:11px 20px;
          border:1px solid transparent;cursor:pointer;text-decoration:none;display:inline-flex;gap:8px;align-items:center;
          transition:transform .12s ease}
        .btn:active{transform:translateY(1px)}
        .btn-green{background:var(--green);color:#fff}
        .btn-ghost{background:transparent;color:var(--ink);border-color:var(--line)}
        .btn-wa{background:#25D366;color:#04310f}
        .nav .btn{padding:9px 15px;font-size:.9rem}

        .langmenu{position:relative}
        .langpill{font-size:.8rem;color:var(--ink-soft);border:1px solid var(--line);border-radius:999px;padding:6px 12px;
          background:var(--card);cursor:pointer;font-family:var(--sans);display:inline-flex;align-items:center;gap:6px}
        .langpill .globe{font-size:.9rem}
        .langpill .caret{font-size:.62rem;opacity:.8}
        .langlist{position:absolute;top:calc(100% + 6px);inset-inline-end:0;z-index:30;margin:0;padding:6px;list-style:none;
          background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);
          min-width:190px;max-width:calc(100vw - 24px);max-height:70vh;overflow:auto}
        .langlist li{margin:0}
        .langopt{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;text-align:start;
          font-family:var(--sans);font-size:.98rem;color:var(--ink);background:transparent;border:0;border-radius:9px;
          padding:9px 12px;cursor:pointer}
        .langopt:hover{background:var(--paper-2)}
        .langopt.active{color:var(--green-deep);font-weight:700;background:var(--green-bg)}
        .langopt .ok{color:var(--green);font-weight:800}

        .hero{display:grid;grid-template-columns:1.15fr .85fr;gap:40px;align-items:center;padding:52px 0 40px}
        .hero .flag{display:inline-flex;align-items:center;gap:9px;font-size:.82rem;color:var(--ink-soft);
          background:var(--card);border:1px solid var(--line);border-radius:999px;padding:6px 13px;margin-bottom:20px}
        .flag .bars{width:22px;height:14px;border-radius:3px;background:linear-gradient(var(--haldi) 0 33%,#fff 33% 66%,var(--green) 66% 100%);border:1px solid var(--line)}
        h1{font-size:clamp(2.3rem,5.4vw,3.9rem)}
        h1 .devnag{color:var(--green-deep)}
        .hero .sub{margin-top:20px;font-size:1.16rem;color:var(--ink-soft);max-width:52ch}
        .hero .cta{margin-top:26px;display:flex;gap:12px;flex-wrap:wrap}
        .trust{margin-top:22px;display:flex;flex-wrap:wrap;gap:8px 18px;font-size:.86rem;color:var(--ink-soft)}
        .trust b{color:var(--ink);font-weight:600}
        .trust .d{color:var(--haldi)}

        .phone{justify-self:center;width:min(300px,86vw);background:#0E1510;border-radius:34px;padding:12px;
          box-shadow:inset 0 0 0 2px var(--line),var(--shadow);position:relative}
        .phone::before{content:"";position:absolute;top:14px;left:50%;transform:translateX(-50%);width:80px;height:5px;
          border-radius:3px;background:#2a352b}
        .scr{background:#12180F;border-radius:24px;padding:26px 12px 14px;display:grid;gap:10px}
        .scr .bar{display:flex;justify-content:space-between;color:#8ea593;font-size:.7rem;padding:0 4px}
        .scr .title{font-weight:700;color:#eef6ea;font-size:1.02rem;padding:2px 4px 4px}
        .row{background:#1b241b;border:1px solid #ffffff14;border-radius:12px;padding:11px 12px;display:flex;
          justify-content:space-between;align-items:center;gap:10px}
        .row .nm{color:#eef6ea;font-weight:600;font-size:.92rem}
        .row .ph{color:#8ea593;font-size:.74rem}
        .amt{font-weight:700;font-variant-numeric:tabular-nums}
        .amt.owe{color:#ff8a7d}.amt.paid{color:#5fcf87}
        .wabubble{background:#075E54;color:#eafff4;border-radius:4px 13px 13px 13px;padding:10px 12px;font-size:.82rem;
          line-height:1.5;max-width:92%}
        .wabubble .t{display:block;text-align:right;color:#a7c9bd;font-size:.6rem;margin-top:3px}

        section{padding:56px 0;border-top:1px solid var(--line)}
        .center{text-align:center;max-width:64ch;margin:0 auto}
        h2{font-size:clamp(1.7rem,3.4vw,2.5rem)}
        .lede{color:var(--ink-soft);font-size:1.08rem;margin-top:12px}

        .pillars{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:36px}
        .pill{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:24px 22px;
          display:flex;flex-direction:column;gap:12px;box-shadow:var(--shadow)}
        .pill .ic{width:48px;height:48px;border-radius:12px;display:grid;place-items:center;font-size:1.5rem;
          background:var(--green-bg)}
        .pill:nth-child(2) .ic{background:color-mix(in srgb,var(--haldi) 26%,transparent)}
        .pill:nth-child(3) .ic{background:var(--red-bg)}
        .pill h3{font-size:1.3rem}
        .pill p{color:var(--ink-soft);font-size:.96rem}
        .pill .k{margin-top:2px;font-size:.85rem;color:var(--green-deep);font-weight:600}

        .getapp{display:grid;grid-template-columns:repeat(2,1fr);gap:20px;margin-top:36px}
        .getcard{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:24px 22px;
          display:flex;flex-direction:column;gap:12px;align-items:flex-start;box-shadow:var(--shadow)}
        .getcard .ic{width:48px;height:48px;border-radius:12px;display:grid;place-items:center;font-size:1.5rem;
          background:var(--green-bg)}
        .getcard:nth-child(2) .ic{background:color-mix(in srgb,var(--haldi) 26%,transparent)}
        .getcard h3{font-size:1.3rem}
        .getcard p{color:var(--ink-soft);font-size:.96rem;flex:1 1 auto}
        .getcard .btn{margin-top:4px}
        .getnote{text-align:center;max-width:60ch;margin:22px auto 0;color:var(--ink-soft);font-size:.86rem}

        .costgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:34px}
        .cost{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--red);border-radius:var(--radius);
          padding:24px 22px;box-shadow:var(--shadow)}
        .cost .big{font-family:var(--disp);font-weight:700;font-size:2.1rem;color:var(--red);font-variant-numeric:tabular-nums;line-height:1}
        .cost .cl{margin-top:10px;color:var(--ink-soft);font-size:.95rem}
        .cost .cl b{color:var(--ink);font-weight:600}
        .illus{text-align:center;max-width:60ch;margin:22px auto 0;color:var(--ink-soft);font-size:.86rem;font-style:italic}

        .econ{display:grid;grid-template-columns:repeat(2,1fr);gap:20px;margin-top:34px}
        .ec{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:24px 22px;
          display:flex;flex-direction:column;gap:9px;box-shadow:var(--shadow)}
        .ec .ei{font-size:1.7rem}
        .ec h3{font-size:1.24rem}
        .ec p{color:var(--ink-soft);font-size:.96rem}
        .econ-line{text-align:center;max-width:66ch;margin:28px auto 0;font-family:var(--disp);font-size:1.22rem;
          color:var(--green-deep);line-height:1.4}

        .band{background:linear-gradient(135deg,var(--green-deep),var(--green));color:#fff;border-radius:22px;
          padding:40px 34px;display:grid;grid-template-columns:1.2fr .8fr;gap:26px;align-items:center;box-shadow:var(--shadow)}
        .band h2{color:#fff}
        .band .q{color:#eafff0;font-size:1.05rem;margin-top:10px}
        .band .stats{display:grid;gap:14px}
        .band .stat{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #ffffff33;padding-bottom:10px}
        .band .stat:last-child{border-bottom:0}
        .band .stat b{font-family:var(--disp);font-size:1.5rem;font-weight:700}
        .band .stat span{color:#dff4e6;font-size:.9rem;align-self:end;text-align:right}

        .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:34px;counter-reset:s}
        .step{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:22px;position:relative}
        .step .n{font-family:var(--disp);font-weight:700;color:var(--haldi);font-size:1.1rem}
        .step h3{font-size:1.12rem;margin:8px 0 6px}
        .step p{color:var(--ink-soft);font-size:.94rem}

        .langs{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:26px}
        .lang{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:9px 18px;font-weight:600;
          font-size:1.02rem;font-family:var(--sans);color:var(--ink);cursor:pointer;transition:transform .12s ease,border-color .12s ease}
        .lang:hover{border-color:var(--green)}
        .lang:active{transform:translateY(1px)}
        .lang.active{background:var(--green);color:#fff;border-color:var(--green)}

        .values{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:32px}
        .val{display:flex;gap:11px;align-items:flex-start;font-size:.95rem}
        .val .c{color:var(--green);font-weight:800;font-size:1.05rem;line-height:1.3}
        .val b{font-weight:600}.val span{color:var(--ink-soft)}

        .final{text-align:center;background:var(--card);border:1px solid var(--line);border-radius:24px;padding:48px 26px;
          box-shadow:var(--shadow)}
        .final .cta{margin-top:24px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
        .final .note{margin-top:16px;color:var(--ink-soft);font-size:.88rem}
        .final a.link{color:var(--green-deep);font-weight:600;text-decoration:underline}

        .nlcard{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:34px 30px;
          display:grid;grid-template-columns:1fr .9fr;gap:26px;align-items:center;box-shadow:var(--shadow)}
        .nlform{display:flex;flex-direction:column;gap:8px}
        .nlrow{display:flex;gap:8px;flex-wrap:wrap}
        .nlinput,.nlselect{font-family:var(--sans);font-size:.95rem;border:1px solid var(--line);border-radius:999px;
          padding:11px 16px;background:var(--paper);color:var(--ink);min-width:0}
        .nlinput{flex:1 1 180px}
        .nlselect{flex:0 1 auto}
        .nlform .btn{padding:11px 20px}
        .nlnote{font-size:.78rem;color:var(--ink-soft);margin-top:2px}
        .nlerr{font-size:.85rem;color:var(--red);margin-top:2px}
        .nldone{display:flex;gap:12px;align-items:center;background:var(--green-bg);border:1px solid var(--line);
          border-radius:var(--radius);padding:18px 20px}
        .nldone .tick{width:34px;height:34px;border-radius:50%;background:var(--green);color:#fff;display:grid;
          place-items:center;font-weight:800;flex:none}
        .nldone b{display:block}.nldone span{color:var(--ink-soft);font-size:.9rem}
        footer{padding:34px 0 60px;color:var(--ink-soft);font-size:.86rem;border-top:1px solid var(--line)}
        .foot{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:center}
        .footlinks{display:flex;gap:16px;align-items:center}
        .footlink{color:var(--green-deep);font-weight:600}

        @media(max-width:880px){
          .hero{grid-template-columns:1fr;gap:28px;padding:34px 0}
          .phone{order:-1}
          .pillars,.steps,.values,.costgrid,.econ,.getapp{grid-template-columns:1fr}
          .band,.nlcard{grid-template-columns:1fr}
          .values{grid-template-columns:1fr 1fr}
          .nav .btn-ghost{display:none}
          /* On narrow screens the language trigger sits left-of-centre, so a
             right-aligned menu overflows off the left edge. Anchor it to the
             trigger's left instead so it opens rightward and stays on screen. */
          .langlist{inset-inline-start:0;inset-inline-end:auto}
        }
        @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{transition:none!important}}
      `}</style>
    </>
  );
}
