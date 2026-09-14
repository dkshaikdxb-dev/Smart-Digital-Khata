import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* No-flash appearance: apply STORED consumer preferences before first
            paint. Colour theme (data-theme) and layout (data-cpwa-layout) are two
            independent axes, each in its own try/catch so a failure in one cannot
            starve the other. With no stored pref, neither attribute is set and the
            consumer PWA follows the device via prefers-color-scheme in the standard
            layout. The owner dashboard ignores the .cpwa tokens and its bare :root
            stays dark regardless.

            The withdrawn 'warm' theme (and its legacy name 'gaon') is migrated to
            "follow the device" HERE, before paint, rather than being forced to
            light: the stored value is deleted and no data-theme is set, so the
            user lands on whichever half their phone is already in. Deleting it
            makes the migration a one-time event. The LAYOUT axis below is a
            separate setting and its own 'gaon' value is untouched. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('skhata-theme');if(t==='warm'||t==='gaon'){try{localStorage.removeItem('skhata-theme');}catch(e){}t=null;}if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}else{document.documentElement.removeAttribute('data-theme');}}catch(e){}try{var l=localStorage.getItem('skhata-layout');if(l==='gaon'){document.documentElement.setAttribute('data-cpwa-layout','gaon');}}catch(e){}})();",
          }}
        />
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
