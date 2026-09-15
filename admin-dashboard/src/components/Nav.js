import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import LangSwitch from './LangSwitch';
import OwnerTabBar from './OwnerTabBar';
import OrderAlert from './OrderAlert';
import { clearApiCache } from '../lib/api';
import { useLang } from '../lib/i18n';
import { usePermissions, clearPermsCache } from '../lib/adminPerms';
import { usePendingReview, clearPendingReviewCache } from '../lib/pendingReview';

export default function Nav() {
  const router = useRouter();
  const { t } = useLang();
  const [role, setRole] = useState(null);
  // Only admins have a permission set; skip the /api/admin/me fetch otherwise.
  const { has } = usePermissions(role === 'admin');
  // How much is waiting on the moderation desk. One cached request per session,
  // asked only of an admin who may act on the answer (ads:manage — the same
  // permission the three queues themselves carry), so the pill can never
  // announce work the viewer is not allowed to see.
  const canReview = role === 'admin' && has('ads:manage');
  const { total: pendingTotal, ready: pendingReady } = usePendingReview(canReview);

  // When the page is loaded inside the native app's WebView it is opened with
  // ?embed=1. In that case the app already provides its own header + bottom tab
  // bar, so we render NO web chrome (this whole component) to avoid a doubled
  // navigation. Read synchronously from the URL so the first paint is already
  // correct; the effect re-checks after client-side route changes.
  const [embedded, setEmbedded] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      if (new URLSearchParams(window.location.search).get('embed') === '1') return true;
      // Sticky for the WebView session so internal link navigation (which may
      // drop the query param) keeps hiding the chrome. A normal browser user
      // never sets this.
      return window.sessionStorage.getItem('skhata_embed') === '1';
    } catch (e) { return false; }
  });

  useEffect(() => {
    setRole(window.localStorage.getItem('skhata_role') || 'owner');
  }, []);

  useEffect(() => {
    try {
      const urlEmbed = new URLSearchParams(window.location.search).get('embed') === '1' || router.query.embed === '1';
      if (urlEmbed) { try { window.sessionStorage.setItem('skhata_embed', '1'); } catch (e) { /* ignore */ } }
      let sticky = false;
      try { sticky = window.sessionStorage.getItem('skhata_embed') === '1'; } catch (e) { /* ignore */ }
      setEmbedded(urlEmbed || sticky);
    } catch (e) { /* ignore */ }
  }, [router.query.embed]);

  if (embedded) return null;

  const logout = () => {
    window.localStorage.removeItem('skhata_token');
    window.localStorage.removeItem('skhata_role');
    // Drop cached API responses so a shared device doesn't leak this user's data.
    clearApiCache();
    clearPermsCache();
    clearPendingReviewCache();
    router.push('/login');
  };

  return (
    <div className="nav">
      <strong>Smart Digital Khata</strong>
      {role === 'admin' ? (
        <>
          <Link href="/admin/dashboard">{t('dash.nav')}</Link>
          <Link href="/admin/funnel">Funnel</Link>
          <Link href="/admin">{t('nav.platform')}</Link>
          {has('customers:view') && <Link href="/admin/customers">{t('mod.navConsumers')}</Link>}
          {has('revenue:view') && <Link href="/admin/referrals">{t('ref.navReferrals')}</Link>}
          {has('revenue:view') && <Link href="/admin/referral-campaigns">{t('rc.nav')}</Link>}
          {has('content:manage') && <Link href="/admin/content">{t('content.nav')}</Link>}
          {has('ads:view') && <Link href="/admin/ads">Campaigns</Link>}
          {/* Moderation is the desk, not just the log: an ads:manage admin (the
              marketing role holds it without audit:view) has a queue to work
              there, so the link is shown for either permission. The pill is the
              only place the console says work is waiting — it is absent, not a
              zero, when nothing is (calm) and when the count is unknown. */}
          {(has('audit:view') || canReview) && (
            <Link href="/admin/moderation">
              {t('mod.navModeration')}
              {pendingReady && pendingTotal > 0 && (
                <span
                  className="badge"
                  style={{ marginLeft: 6, background: 'var(--warn-bg)', color: 'var(--warn-ink)', fontWeight: 700 }}
                  aria-label={t('mod.pendingAria', { n: pendingTotal })}
                >
                  {pendingTotal}
                </span>
              )}
            </Link>
          )}
          {has('settings:manage') && <Link href="/admin/settings">{t('nav.settings')}</Link>}
          <Link href="/admin/i18n">{t('nav.translations')}</Link>
          <Link href="/admin/languages">{t('alang.title')}</Link>
          <span className="badge">Platform Admin</span>
        </>
      ) : (
        // On mobile these full links collapse (CSS) in favour of the bottom tab
        // bar below; on desktop they stay as the primary owner navigation.
        <span className="nav-owner-links">
          <Link href="/dashboard">{t('nav.dashboard')}</Link>
          <Link href="/catalog">{t('nav.catalog')}</Link>
          <Link href="/orders">{t('nav.orders')}</Link>
          {role === 'owner' && <Link href="/delivery">{t('nav.delivery')}</Link>}
          <Link href="/customers">{t('nav.customers')}</Link>
          <Link href="/suppliers">{t('sup.nav')}</Link>
          {role === 'owner' && <Link href="/staff">{t('nav.staff')}</Link>}
          {role === 'owner' && <Link href="/promote">{t('promo.nav')}</Link>}
          <Link href="/families">{t('nav.families')}</Link>
          <Link href="/transactions">{t('nav.transactions')}</Link>
          <Link href="/insights">{t('nav.insights')}</Link>
          <Link href="/settings">{t('nav.settings')}</Link>
          <Link href="/account">{t('acc.title')}</Link>
        </span>
      )}
      <span style={{ flex: 1 }} />
      {/* Language switcher. For owner/staff it is hidden on mobile (CSS) in favour
          of the one inside the owner tab bar's "More" sheet, so it is never
          doubled; admins have no tab bar, so theirs stays visible everywhere. */}
      <span className={role && role !== 'admin' ? 'nav-lang-desktop' : ''}><LangSwitch /></span>
      <button className="secondary" onClick={logout}>{t('nav.logout')}</button>
      {/* Icon-first bottom tab bar — owner/staff only, mobile widths only (CSS). */}
      {role && role !== 'admin' && <OwnerTabBar showStaff={role === 'owner'} />}
      {/* Repeating new-order alert (batch ORDERALERT) — owner/staff only. It
          lives HERE because Nav is the one component every owner page mounts, so
          the banner follows the owner around the console; and because Nav
          already returns null when embedded in the native WebView (?embed=1),
          the app never gets a doubled banner over its own. It is
          position:fixed, so it does not disturb this flex row. */}
      {(role === 'owner' || role === 'staff') && <OrderAlert />}
    </div>
  );
}
