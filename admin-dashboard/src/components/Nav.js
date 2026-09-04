import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import LangSwitch from './LangSwitch';
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
          <span className="badge">Platform Admin</span>
        </>
      ) : (
        <>
          <Link href="/">{t('nav.dashboard')}</Link>
          <Link href="/catalog">{t('nav.catalog')}</Link>
          <Link href="/orders">{t('nav.orders')}</Link>
          <Link href="/customers">{t('nav.customers')}</Link>
          <Link href="/families">{t('nav.families')}</Link>
          <Link href="/transactions">{t('nav.transactions')}</Link>
          <Link href="/insights">{t('nav.insights')}</Link>
          <Link href="/settings">{t('nav.settings')}</Link>
        </>
      )}
      <span style={{ flex: 1 }} />
      <LangSwitch />
      <button className="secondary" onClick={logout}>{t('nav.logout')}</button>
    </div>
  );
}
