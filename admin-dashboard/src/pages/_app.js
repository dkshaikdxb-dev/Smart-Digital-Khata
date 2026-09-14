import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import '../styles/globals.css';
import { useLang, isRtl, hasChosenLang, loadOverrides, loadActiveLanguages } from '../lib/i18n';
import { backfillLanguageOnce } from '../lib/langSync';
import CustomerLangGate from '../components/CustomerLangGate';
import OfflineBanner from '../components/OfflineBanner';

export default function App({ Component, pageProps }) {
  const { pathname } = useRouter();
  const { lang } = useLang();
  // The customer PWA lives under /c and needs its own manifest (start_url/scope
  // "/c"); the owner app uses the root manifest. Picking it here — where the
  // route is known at prerender time — keeps a single manifest link per page
  // and lets "add to home screen" open to the right app.
  const isCustomer = pathname === '/c' || pathname.startsWith('/c/');
  const manifest = isCustomer ? '/customer.webmanifest' : '/manifest.webmanifest';

  // Reflect the chosen language on <html> — its direction (rtl for Urdu) and
  // lang. Done in an effect so SSR always renders the neutral default and
  // hydration never mismatches; the real value is applied right after mount and
  // whenever the language changes.
  useEffect(() => {
    const el = document.documentElement;
    el.setAttribute('lang', lang);
    el.setAttribute('dir', isRtl(lang) ? 'rtl' : 'ltr');
  }, [lang]);

  // Register the service worker at a URL carrying THIS build's id. Next mints a
  // fresh build id per `next build` and exposes it on __NEXT_DATA__, so the
  // registration URL changes on every deploy: the browser sees a worker it has
  // not installed before, and the new worker names its caches after the same id
  // and sweeps the previous build's on activate. Nothing to remember to bump —
  // which is exactly how the old hand-typed 'skhata-v2' went stale and started
  // serving weeks-old balances.
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    let buildId = 'dev';
    try {
      buildId = (window.__NEXT_DATA__ && window.__NEXT_DATA__.buildId) || 'dev';
    } catch (e) { /* keep the fallback */ }
    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(buildId)}`).catch(() => {});
  }, []);

  // Load live translation overrides + the active language registry once on the
  // client. SSR renders the static dict and the built-in LANGS (both empty/
  // fallback), so the first client render matches the server; the fetched
  // values apply right after mount (a brief, acceptable swap). Both fetches
  // fail-safe — the app keeps working offline / if the API is down.
  useEffect(() => { loadOverrides(); loadActiveLanguages(); }, []);

  // One-time, best-effort: hand the server the language this device chose back
  // when localStorage was the only place it could live (see langSync). Silent
  // and non-blocking either way.
  useEffect(() => { backfillLanguageOnce(); }, []);

  // First-open language prompt, customer app only. SSR renders nothing (so
  // hydration matches); on mount we show the gate if the viewer is on a /c page
  // and has never picked a language. It's a fixed full-screen overlay, so it
  // covers whatever page loaded behind it.
  const [showLangGate, setShowLangGate] = useState(false);
  useEffect(() => {
    if (isCustomer && !hasChosenLang()) setShowLangGate(true);
  }, [isCustomer]);

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="manifest" href={manifest} />
      </Head>
      <OfflineBanner />
      <Component {...pageProps} />
      {showLangGate && <CustomerLangGate onDone={() => setShowLangGate(false)} />}
    </>
  );
}
