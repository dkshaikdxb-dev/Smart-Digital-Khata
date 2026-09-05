import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import LangSwitch from './LangSwitch';
import { clearApiCache } from '../lib/api';
import { useLang } from '../lib/i18n';

export default function Nav() {
  const router = useRouter();
  const { t } = useLang();
  const [role, setRole] = useState(null);

  useEffect(() => {
    setRole(window.localStorage.getItem('skhata_role') || 'owner');
  }, []);

  const logout = () => {
    window.localStorage.removeItem('skhata_token');
    window.localStorage.removeItem('skhata_role');
    // Drop cached API responses so a shared device doesn't leak this user's data.
    clearApiCache();
    router.push('/login');
  };

  return (
    <div className="nav">
      <strong>Smart Digital Khata</strong>
      {role === 'admin' ? (
        <>
          <Link href="/admin">{t('nav.platform')}</Link>
          <Link href="/admin/settings">{t('nav.settings')}</Link>
          <Link href="/admin/i18n">{t('nav.translations')}</Link>
          <Link href="/admin/languages">{t('alang.title')}</Link>
          <span className="badge">Platform Admin</span>
        </>
      ) : (
        <>
          <Link href="/">{t('nav.dashboard')}</Link>
          <Link href="/catalog">{t('nav.catalog')}</Link>
          <Link href="/orders">{t('nav.orders')}</Link>
          <Link href="/customers">{t('nav.customers')}</Link>
          {role === 'owner' && <Link href="/staff">{t('nav.staff')}</Link>}
          <Link href="/families">{t('nav.families')}</Link>
          <Link href="/transactions">{t('nav.transactions')}</Link>
          <Link href="/insights">{t('nav.insights')}</Link>
          <Link href="/settings">{t('nav.settings')}</Link>
          <Link href="/account">{t('acc.title')}</Link>
        </>
      )}
      <span style={{ flex: 1 }} />
      <LangSwitch />
      <button className="secondary" onClick={logout}>{t('nav.logout')}</button>
    </div>
  );
}
