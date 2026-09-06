import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

// Public marketing landing shown at the site root to logged-OUT visitors.
// A logged-in user never sees this: on mount we check localStorage and send
// owners/staff to /dashboard and platform admins to /admin. The owner dashboard
// itself now lives at /dashboard (see pages/dashboard.js).
//
// The page carries its own EN/HI copy (as approved in the concept) — this is a
// deliberate, self-contained marketing surface and does NOT use the app i18n
// system. Both light and dark themes render from the token structure below.

// WhatsApp CTA target. The number is editable at runtime from Admin → Settings
// (served by GET /api/public/config); until that loads — or if it's unset or the
// request fails — we use this built-in default, so the button always works.
// NEXT_PUBLIC_WHATSAPP still overrides the default at build time.
const DEFAULT_WA_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP || '919731422995';
const WA_TEXT = encodeURIComponent('नमस्ते! मुझे Smart Digital Khata शुरू करना है।');
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const buildWA = (number) =>
  number ? 'https://wa.me/' + number + '?text=' + WA_TEXT : '/register';

export default function Home() {
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(true);
  const [hi, setHi] = useState(false);
  const [wa, setWa] = useState(buildWA(DEFAULT_WA_NUMBER));

  // Pull the admin-configured landing WhatsApp number at runtime; keep the
  // built-in default if it's unset or the request fails (never break the CTA).
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/public/config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const n = d && d.landing_whatsapp ? String(d.landing_whatsapp).replace(/\D/g, '') : '';
        if (!cancelled && n) setWa(buildWA(n));
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
      router.replace(role === 'admin' ? '/admin' : '/dashboard');
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

  const heroH1 = hi
    ? 'आपकी दुकान का खाता — अब फ़ोन में। और यह आपके पैसे भी दिलाता है।'
    : null;
  const heroSub = hi
    ? 'डिजिटल उधार खाता, WhatsApp रिमाइंडर जो जल्दी वसूली कराएँ, और एक ऑनलाइन दुकान जहाँ से ग्राहक ऑर्डर करें — आपकी भाषा में, किसी भी फ़ोन पर, शुरू करना मुफ़्त।'
    : null;

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

      <header>
        <nav className="nav">
          <div className="brand"><span className="mark">ख</span> Smart Digital Khata</div>
          <div className="nav-cta">
            <button className="langpill" onClick={() => setHi((v) => !v)} aria-label="Toggle language">
              {hi ? 'EN / हिन्दी' : 'हिन्दी / EN'}
            </button>
            <a href="/login" className="btn btn-ghost">Sign in</a>
            <a href="/register" className="btn btn-green">Start free</a>
          </div>
        </nav>
      </header>

      <main className="wrap">
        {/* HERO */}
        <section className="hero" style={{ borderTop: 0 }}>
          <div>
            <span className="flag"><span className="bars" /> Made for Bharat · towns &amp; villages</span>
            <h1>
              {hi ? heroH1 : (
                <>
                  <span className="devnag">आपकी दुकान का खाता —</span> now on your phone. And it gets you <em>paid.</em>
                </>
              )}
            </h1>
            <p className="sub">
              {hi ? heroSub : (
                <>
                  A digital <b>udhaar</b> ledger, WhatsApp reminders that collect faster, and a shopfront your customers can order from — in your language, on any phone, free to start.
                </>
              )}
            </p>
            <div className="cta">
              <a href={wa} className="btn btn-wa">🟢 WhatsApp पर शुरू करें</a>
              <a href="/register" className="btn btn-green">मुफ़्त साइन अप · Sign up free</a>
            </div>
            <div className="trust">
              <span><b>2G</b> पर चले</span><span className="d">·</span>
              <span><b>7</b> भाषाएँ</span><span className="d">·</span>
              <span>कंप्यूटर नहीं चाहिए</span><span className="d">·</span>
              <span><b>Free</b> to start</span>
            </div>
          </div>
          <div className="phone" aria-label="The Khata app: a customer's udhaar and a WhatsApp reminder">
            <div className="scr">
              <div className="bar"><span>9:41</span><span>📶 2G · ▮▮▮</span></div>
              <div className="title">आज का हिसाब</div>
              <div className="row"><div><div className="nm">सीता देवी</div><div className="ph">+91 98765 •••01</div></div><div className="amt owe">₹560 बाकी</div></div>
              <div className="row"><div><div className="nm">रमेश कुमार</div><div className="ph">+91 98765 •••02</div></div><div className="amt paid">₹0 जमा</div></div>
              <div className="wabubble">नमस्ते सीता जी 🙏 आपका ₹560 बाकी है। यहाँ से चुकाएँ 👉<span className="t">भेजा गया ✓✓</span></div>
            </div>
          </div>
        </section>

        {/* PROBLEM */}
        <section>
          <div className="center">
            <span className="eyebrow">The problem every dukaandaar knows</span>
            <h2 style={{ marginTop: 12 }}>The paper bahi-khata forgets. Customers forget.<br />And that is <em>your</em> money walking out the door.</h2>
            <p className="lede">Loose pages, faded pencil, “yaad nahi kitna baaki tha.” Chasing dues is awkward and slow — so a little is lost at every counter, every month. Smart Digital Khata turns that register into a memory that never fades and a reminder that does the asking for you.</p>
          </div>
        </section>

        {/* COST OF MANUAL WORK */}
        <section>
          <div className="center">
            <span className="eyebrow">The cost of the paper register</span>
            <h2 style={{ marginTop: 12 }}>Small losses, every single day,<br />add up to real money.</h2>
            <p className="lede">A faded page. A customer who “bhool gaya.” A reminder never sent because it felt awkward. None of it feels big on the day — but count it across a year of counters and it's a serious hole in a hard-earned income.</p>
          </div>
          <div className="costgrid">
            <div className="cost">
              <div className="big">~₹14,600</div>
              <div className="cl">lost in a year if just <b>₹40 of udhaar a day</b> slips through — forgotten, unread, or never chased.</div>
            </div>
            <div className="cost">
              <div className="big">3–5 hrs</div>
              <div className="cl">a week spent adding up the bahi-khata by hand — time that could serve customers or rest.</div>
            </div>
            <div className="cost">
              <div className="big">Awkward</div>
              <div className="cl">asking a neighbour for money face-to-face. So many dues are quietly written off.</div>
            </div>
          </div>
          <p className="illus">Illustrative — every shop is different. The point isn't the exact number; it's that manual work leaks money and time, quietly, every day. Smart Digital Khata plugs the leak.</p>
        </section>

        {/* PILLARS */}
        <section>
          <div className="center"><span className="eyebrow">What you get</span><h2 style={{ marginTop: 12 }}>Three things, one simple app</h2></div>
          <div className="pillars">
            <div className="pill">
              <div className="ic">📗</div>
              <h3>Digital khata that pays you back</h3>
              <p>Record udhaar in seconds. Automatic WhatsApp &amp; SMS reminders — in the customer's own language — get you paid faster. Cash, UPI or online, all settled in one place.</p>
              <div className="k">Get paid, not just tracked →</div>
            </div>
            <div className="pill">
              <div className="ic">🛒</div>
              <h3>Your shop, discoverable</h3>
              <p>A shopfront customers can browse and order from — you choose pickup, free delivery or a delivery charge. Local commerce for your galli, not a metro q-commerce app.</p>
              <div className="k">New customers, on your terms →</div>
            </div>
            <div className="pill">
              <div className="ic">🗣️</div>
              <h3>Truly made for Bharat</h3>
              <p>Seven languages with voice read-aloud, a 1,600-item catalogue in your language, and it works offline on 2G — on the everyday phone already in your pocket. No KYC to begin.</p>
              <div className="k">Your language, your phone →</div>
            </div>
          </div>
        </section>

        {/* POSITIONING BAND */}
        <section>
          <div className="band">
            <div>
              <span className="eyebrow" style={{ color: '#eafff0' }}>Where we belong</span>
              <h2 style={{ marginTop: 10 }}>Built for B &amp; C towns and villages — <br />not the metros.</h2>
              <p className="q">Regional-first, lite, and yours. The shopkeeper stays in charge — this is a tool that respects how a kirana already works, and quietly makes it stronger. Not disruption. Digitisation with dignity.</p>
            </div>
            <div className="stats">
              <div className="stat"><b>7</b><span>languages, incl. Hindi, Tamil, Telugu, Kannada, Malayalam &amp; Urdu</span></div>
              <div className="stat"><b>1,600+</b><span>ready grocery items in your language</span></div>
              <div className="stat"><b>Offline</b><span>works and syncs on flaky 2G</span></div>
              <div className="stat"><b>₹0</b><span>to start — no card, no computer</span></div>
            </div>
          </div>
        </section>

        {/* LOCAL ECONOMY / EMPOWERMENT */}
        <section>
          <div className="center">
            <span className="eyebrow">The bigger picture</span>
            <h2 style={{ marginTop: 12 }}>Digitise one dukaan, and something<br />bigger happens to the whole town.</h2>
            <p className="lede">A kirana shop isn't just a business — it's the trust, the credit, and the daily lifeline of a mohalla. When it grows stronger, the neighbourhood grows with it.</p>
          </div>
          <div className="econ">
            <div className="ec"><div className="ei">🏘️</div><h3>Money stays in the village</h3><p>Customers buy from the shop down the lane, not a warehouse two cities away. The margin — and the livelihood — stays local instead of leaving town.</p></div>
            <div className="ec"><div className="ei">🔄</div><h3>Cash flow comes back to life</h3><p>Udhaar collected faster is working capital unstuck. The shopkeeper can restock sooner, extend fair credit, and keep serving neighbours through lean months.</p></div>
            <div className="ec"><div className="ei">🗣️</div><h3>Dignity in your own language</h3><p>A shopkeeper who never touched English software now runs a modern business in Tamil, Telugu, Hindi or Urdu — reading it, hearing it, understood by it. Digital inclusion that actually includes.</p></div>
            <div className="ec"><div className="ei">🛡️</div><h3>The corner shop stays viable</h3><p>Against big chains and metro apps, the trusted local kirana gets the same modern tools — on the phone it already owns. The shop your family knows, future-proofed.</p></div>
          </div>
          <p className="econ-line">Every reminder paid, every order fulfilled, every rupee that stays in town — that's a village economy getting a little stronger, one khata at a time.</p>
        </section>

        {/* STEPS */}
        <section>
          <div className="center"><span className="eyebrow">How it works</span><h2 style={{ marginTop: 12 }}>Live in five minutes</h2></div>
          <div className="steps">
            <div className="step"><div className="n">01</div><h3>Sign up with your mobile</h3><p>Just your phone number and a password or PIN. Change your number later without losing your khata.</p></div>
            <div className="step"><div className="n">02</div><h3>Add customers &amp; items</h3><p>Type them in, or pick from the 1,600-item catalogue shown in your language. Set your own prices.</p></div>
            <div className="step"><div className="n">03</div><h3>Record, remind, sell</h3><p>Note udhaar, let WhatsApp chase the dues, and take orders from your shopfront. See it all on one screen.</p></div>
          </div>
        </section>

        {/* LANGUAGES */}
        <section>
          <div className="center">
            <span className="eyebrow">आपकी भाषा में</span>
            <h2 style={{ marginTop: 12 }}>The whole app speaks your language</h2>
            <p className="lede">And when your state's language is ready, we switch it on — after a native speaker has checked every word.</p>
          </div>
          <div className="langs">
            <span className="lang">हिन्दी</span><span className="lang">தமிழ்</span><span className="lang">తెలుగు</span>
            <span className="lang">ಕನ್ನಡ</span><span className="lang">മലയാളം</span><span className="lang">اردو</span><span className="lang">English</span>
          </div>
          <div className="values">
            <div className="val"><span className="c">✓</span><div><b>Your data is yours.</b> <span>No selling, no spam. Export your khata any time.</span></div></div>
            <div className="val"><span className="c">✓</span><div><b>No heavy app.</b> <span>Small download, opens fast, kind to your data pack.</span></div></div>
            <div className="val"><span className="c">✓</span><div><b>Free to start.</b> <span>Upgrade only when it's clearly earning for you.</span></div></div>
            <div className="val"><span className="c">✓</span><div><b>You stay in control.</b> <span>You decide prices, delivery, reminders — always.</span></div></div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section id="start">
          <div className="final">
            <span className="eyebrow">Aaj se shuru karein</span>
            <h2 style={{ marginTop: 12 }}>Give your shop a memory that never forgets.</h2>
            <p className="lede" style={{ maxWidth: '52ch', marginInline: 'auto' }}>Thousands of counters across Bharat run on udhaar. Make yours run on Smart Digital Khata — free to begin, in your language, today.</p>
            <div className="cta">
              <a href={wa} className="btn btn-wa">🟢 WhatsApp पर शुरू करें</a>
              <a href="/register" className="btn btn-green">मुफ़्त साइन अप · Sign up free</a>
            </div>
            <p className="note">Already live at <a className="link" href="/">khata.dadashaik.com</a> · works on any Android phone</p>
          </div>
        </section>
      </main>

      <footer className="wrap">
        <div className="foot">
          <div className="brand"><span className="mark">ख</span> Smart Digital Khata</div>
          <div>हर दुकान, अब डिजिटल · Every shop, now digital</div>
          <div>© Smart Digital Khata</div>
        </div>
      </footer>

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
        .langpill{font-size:.8rem;color:var(--ink-soft);border:1px solid var(--line);border-radius:999px;padding:6px 12px;
          background:var(--card);cursor:pointer;font-family:var(--sans)}

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
          font-size:1.02rem}

        .values{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:32px}
        .val{display:flex;gap:11px;align-items:flex-start;font-size:.95rem}
        .val .c{color:var(--green);font-weight:800;font-size:1.05rem;line-height:1.3}
        .val b{font-weight:600}.val span{color:var(--ink-soft)}

        .final{text-align:center;background:var(--card);border:1px solid var(--line);border-radius:24px;padding:48px 26px;
          box-shadow:var(--shadow)}
        .final .cta{margin-top:24px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
        .final .note{margin-top:16px;color:var(--ink-soft);font-size:.88rem}
        .final a.link{color:var(--green-deep);font-weight:600;text-decoration:underline}

        footer{padding:34px 0 60px;color:var(--ink-soft);font-size:.86rem;border-top:1px solid var(--line)}
        .foot{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:center}

        @media(max-width:880px){
          .hero{grid-template-columns:1fr;gap:28px;padding:34px 0}
          .phone{order:-1}
          .pillars,.steps,.values,.costgrid,.econ{grid-template-columns:1fr}
          .band{grid-template-columns:1fr}
          .values{grid-template-columns:1fr 1fr}
          .nav .btn-ghost{display:none}
        }
        @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{transition:none!important}}
      `}</style>
    </>
  );
}
