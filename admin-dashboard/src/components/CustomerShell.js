import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import CustomerTabBar from './CustomerTabBar';
import LangSwitch from './LangSwitch';
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
export default function CustomerShell({ title, children, tabs = true, back }) {
  const router = useRouter();
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
        <header className="cpwa-topbar">
          {back && (
            <button type="button" className="secondary cpwa-back" onClick={() => router.push(back)} aria-label="Back">
              ‹
            </button>
          )}
          {title && <h1>{title}</h1>}
          <span style={{ flex: 1 }} />
          <LangSwitch variant="cpwa" />
        </header>
        <main className={tabs ? 'cpwa-main has-tabs' : 'cpwa-main'}>{children}</main>
        {tabs && <CustomerTabBar />}
      </div>
    </div>
  );
}
