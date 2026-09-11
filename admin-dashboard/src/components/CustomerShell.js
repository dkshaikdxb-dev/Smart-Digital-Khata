import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import CustomerTabBar from './CustomerTabBar';
import LangSwitch from './LangSwitch';
import CpwaThemeToggle from './CpwaThemeToggle';
import CpwaLocationPicker from './CpwaLocationPicker';
import { getCustomerToken } from '../lib/customerApi';

const fmtRs = (paise) => `₹${(Number(paise || 0) / 100).toFixed(2)}`;

// Money formatter shared across the customer pages. Money is paise everywhere.
export function money(paise) {
  return fmtRs(paise);
}

// Guard hook: on gated pages, redirect to /c/login (preserving where the
// customer wanted to go) when no customer token is present. Returns `true`
// once the check has run and a token exists.
export function useCustomerGuard() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!getCustomerToken()) {
      const next = encodeURIComponent(router.asPath);
      router.replace(`/c/login?next=${next}`);
      return;
    }
    setReady(true);
  }, [router]);
  return ready;
}

// Page shell: centered mobile column (max ~480px), Head metadata for PWA
// installability, an optional title bar, and the bottom tab bar when `tabs`.
//
// Embed gate: when the page is opened inside the native app's WebView it is
// loaded with ?embed=1. The app already renders its own header + bottom tab bar,
// so we render NO web chrome (no top bar, no CustomerTabBar, no has-tabs padding)
// to avoid a doubled navigation. This mirrors Nav.js exactly, including the sticky
// `skhata_embed` sessionStorage flag so internal link navigation (which may drop
// the query param) keeps the chrome hidden for the whole WebView session. A normal
// browser user never sets this.
export default function CustomerShell({ title, children, tabs = true, back }) {
  const router = useRouter();

  const [embedded, setEmbedded] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      if (new URLSearchParams(window.location.search).get('embed') === '1') return true;
      return window.sessionStorage.getItem('skhata_embed') === '1';
    } catch (e) { return false; }
  });

  useEffect(() => {
    try {
      const urlEmbed = new URLSearchParams(window.location.search).get('embed') === '1' || router.query.embed === '1';
      if (urlEmbed) { try { window.sessionStorage.setItem('skhata_embed', '1'); } catch (e) { /* ignore */ } }
      let sticky = false;
      try { sticky = window.sessionStorage.getItem('skhata_embed') === '1'; } catch (e) { /* ignore */ }
      setEmbedded(urlEmbed || sticky);
    } catch (e) { /* ignore */ }
  }, [router.query.embed]);

  const showChrome = !embedded;
  const showTabs = showChrome && tabs;

  return (
    <div className="cpwa">
      <Head>
        <title>{title ? `${title} · Khata` : 'Smart Digital Khata'}</title>
        <meta name="theme-color" content="#0f172a" />
        {/* The /customer.webmanifest link is emitted once in _app.js for all /c
            routes, so it is intentionally not repeated here. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Khata" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      </Head>
      <div className="cpwa-shell">
        {showChrome && (
          <header className="cpwa-topbar">
            <div className="cpwa-topbar-lead">
              {back && (
                <button type="button" className="secondary cpwa-back" onClick={() => router.push(back)} aria-label="Back">
                  ‹
                </button>
              )}
              {title && <h1 className="cpwa-topbar-title">{title}</h1>}
            </div>
            <div className="cpwa-topbar-tools">
              <CpwaLocationPicker />
              <CpwaThemeToggle />
              <LangSwitch variant="cpwa" />
            </div>
          </header>
        )}
        <main className={showTabs ? 'cpwa-main has-tabs' : 'cpwa-main'}>{children}</main>
        {showTabs && <CustomerTabBar />}
      </div>
    </div>
  );
}
