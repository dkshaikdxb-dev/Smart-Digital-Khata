import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta name="application-name" content="Smart Digital Khata" />
        <meta name="description" content="Manage your kirana credit ledger and collect dues faster over WhatsApp." />
        {/* The web manifest is chosen per-area in _app.js: the owner app and the
            customer PWA (/c) need different start_url/scope, so it must not be
            hard-coded here. */}
        <meta name="theme-color" content="#0f172a" />

        {/* iOS home-screen app */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Khata" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
