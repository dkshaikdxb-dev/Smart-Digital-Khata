import { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import '../styles/globals.css';
import { useLang, isRtl } from '../lib/i18n';

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

  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="manifest" href={manifest} />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
