import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useLang } from '../lib/i18n';

// Icon-first bottom tab bar for shop OWNERS on mobile widths, mirroring the
// consumer CustomerTabBar pattern. Five primary destinations with a clear emoji
// icon + a short label in the owner's language; the fifth ("More") opens a simple
// sheet linking the rest of the pages. It is CSS-hidden on desktop (where the top
// nav's full link row shows instead) — no router changes, purely responsive.
//
// It adds `owner-has-tabs` to <body> on mount so the page content gets bottom
// padding on mobile and the fixed bar never covers the last card. Large (≥44px)
// tap targets, RTL-safe (plain flex, no hard-coded left/right).
export default function OwnerTabBar({ showStaff = true }) {
  const router = useRouter();
  const { t } = useLang();
  const path = router.pathname;
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    document.body.classList.add('owner-has-tabs');
    return () => document.body.classList.remove('owner-has-tabs');
  }, []);

  // Close the More sheet whenever the route changes (e.g. a link inside it fires).
  useEffect(() => {
    const close = () => setMoreOpen(false);
    router.events.on('routeChangeStart', close);
    return () => router.events.off('routeChangeStart', close);
  }, [router.events]);

  const isActive = (base) => (base === '/dashboard' ? path === '/dashboard' : path === base || path.startsWith(`${base}/`));

  // The "More" tab is highlighted when the current page is one of the secondary
  // destinations it links to.
  const moreRoutes = ['/transactions', '/families', '/staff', '/insights', '/settings', '/account'];
  const moreActive = moreRoutes.some((base) => path === base || path.startsWith(`${base}/`));

  const moreItems = [
    { href: '/transactions', ico: '🧾', label: t('nav.transactions') },
    { href: '/families', ico: '👨‍👩‍👧', label: t('nav.families') },
    ...(showStaff ? [{ href: '/staff', ico: '🧑‍💼', label: t('nav.staff') }] : []),
    { href: '/insights', ico: '📊', label: t('nav.insights') },
    { href: '/settings', ico: '⚙️', label: t('nav.settings') },
    { href: '/account', ico: '👤', label: t('acc.title') },
  ];

  return (
    <>
      {moreOpen && (
        <>
          <div className="owner-more-backdrop" onClick={() => setMoreOpen(false)} aria-hidden="true" />
          <div className="owner-more-sheet" role="dialog" aria-label={t('nav.more')}>
            <div className="owner-more-title">{t('nav.more')}</div>
            <div className="owner-more-grid">
              {moreItems.map((it) => (
                <Link
                  key={it.href}
                  href={it.href}
                  className={`owner-more-item${path === it.href || path.startsWith(`${it.href}/`) ? ' active' : ''}`}
                  onClick={() => setMoreOpen(false)}
                >
                  <span className="owner-more-ico" aria-hidden="true">{it.ico}</span>
                  <span>{it.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      <nav className="owner-tabbar" aria-label={t('nav.dashboard')}>
        <Link href="/dashboard" className={isActive('/dashboard') ? 'active' : ''}>
          <span className="owner-tab-ico" aria-hidden="true">🏠</span>
          <span>{t('nav.tabHome')}</span>
        </Link>
        <Link href="/customers" className={isActive('/customers') ? 'active' : ''}>
          <span className="owner-tab-ico" aria-hidden="true">👥</span>
          <span>{t('nav.customers')}</span>
        </Link>
        <Link href="/catalog" className={isActive('/catalog') ? 'active' : ''}>
          <span className="owner-tab-ico" aria-hidden="true">📦</span>
          <span>{t('nav.catalog')}</span>
        </Link>
        <Link href="/orders" className={isActive('/orders') ? 'active' : ''}>
          <span className="owner-tab-ico" aria-hidden="true">🛒</span>
          <span>{t('nav.orders')}</span>
        </Link>
        <button
          type="button"
          className={moreOpen || moreActive ? 'active' : ''}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((v) => !v)}
        >
          <span className="owner-tab-ico" aria-hidden="true">☰</span>
          <span>{t('nav.more')}</span>
        </button>
      </nav>
    </>
  );
}
