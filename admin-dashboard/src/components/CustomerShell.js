import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import CustomerTabBar from './CustomerTabBar';
import LangSwitch from './LangSwitch';
import CpwaThemeToggle from './CpwaThemeToggle';
import CpwaLocationPicker from './CpwaLocationPicker';
import { getCustomerToken } from '../lib/customerApi';

// Money formatter shared across the customer pages. Money is paise everywhere,
// and the formatting itself lives in lib/money.js — this is only the name the
// /c pages already import.
export { money } from '../lib/money';

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
            {/* The tools row may WRAP, and may be SQUEEZED. It holds three
                controls whose widths are text-dependent — the location chip's
                label, the language select's native-script value — and on a 320px
                screen their natural widths add up to slightly more than the bar
                can give them. The row used to be unable to do either: it was
                sized to its own content and could not shrink, so the shortfall
                was taken out of the one control that yields (the location chip),
                which did not get narrower but got OVERLAPPED by its neighbour,
                with the end of "Set location" underneath it.
                Wrapping spends a row of height instead, which is the one currency
                here that costs the shopper nothing; `flex: 0 1 auto; min-width: 0`
                keeps the row itself inside the bar, so a saved town name with no
                upper bound ends in an ellipsis rather than in a sideways scroll
                of the whole page. */}
            <div
              className="cpwa-topbar-tools"
              style={{ flexWrap: 'wrap', justifyContent: 'flex-end', flex: '0 1 auto', minWidth: 0 }}
            >
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
