import { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import '../styles/globals.css';

export default function App({ Component, pageProps }) {
  const { pathname } = useRouter();
  // The customer PWA lives under /c and needs its own manifest (start_url/scope
  // "/c"); the owner app uses the root manifest. Picking it here — where the
  // route is known at prerender time — keeps a single manifest link per page
  // and lets "add to home screen" open to the right app.
  const isCustomer = pathname === '/c' || pathname.startsWith('/c/');
  const manifest = isCustomer ? '/customer.webmanifest' : '/manifest.webmanifest';

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
