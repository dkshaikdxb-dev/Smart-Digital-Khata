import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import LangSwitch from './LangSwitch';
import OwnerTabBar from './OwnerTabBar';
import { clearApiCache } from '../lib/api';
import { useLang } from '../lib/i18n';
import { usePermissions, clearPermsCache } from '../lib/adminPerms';

export default function Nav() {
  const router = useRouter();
  const { t } = useLang();
  const [role, setRole] = useState(null);
  // Only admins have a permission set; skip the /api/admin/me fetch otherwise.
  const { has } = usePermissions(role === 'admin');

  useEffect(() => {
    setRole(window.localStorage.getItem('skhata_role') || 'owner');
  }, []);

  const logout = () => {
    window.localStorage.removeItem('skhata_token');
    window.localStorage.removeItem('skhata_role');
    // Drop cached API responses so a shared device doesn't leak this user's data.
    clearApiCache();
    clearPermsCache();
    router.push('/login');
  };

  return (
    <div className="nav">
      <strong>Smart Digital Khata</strong>
      {role === 'admin' ? (
        <>
          <Link href="/admin/dashboard">{t('dash.nav')}</Link>
          <Link href="/admin">{t('nav.platform')}</Link>
          {has('customers:view') && <Link href="/admin/customers">{t('mod.navConsumers')}</Link>}
          {has('revenue:view') && <Link href="/admin/referrals">{t('ref.navReferrals')}</Link>}
          {has('audit:view') && <Link href="/admin/moderation">{t('mod.navModeration')}</Link>}
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
          <Link href="/customers">{t('nav.customers')}</Link>
          <Link href="/suppliers">{t('sup.nav')}</Link>
          {role === 'owner' && <Link href="/staff">{t('nav.staff')}</Link>}
          <Link href="/families">{t('nav.families')}</Link>
          <Link href="/transactions">{t('nav.transactions')}</Link>
          <Link href="/insights">{t('nav.insights')}</Link>
          <Link href="/settings">{t('nav.settings')}</Link>
          <Link href="/account">{t('acc.title')}</Link>
        </span>
      )}
      <span style={{ flex: 1 }} />
      <LangSwitch />
      <button className="secondary" onClick={logout}>{t('nav.logout')}</button>
      {/* Icon-first bottom tab bar — owner/staff only, mobile widths only (CSS). */}
      {role && role !== 'admin' && <OwnerTabBar showStaff={role === 'owner'} />}
    </div>
  );
}
