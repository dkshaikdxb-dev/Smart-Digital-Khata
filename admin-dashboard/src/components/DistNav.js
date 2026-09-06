import Link from 'next/link';
import { useRouter } from 'next/router';
import LangSwitch from './LangSwitch';
import { clearApiCache } from '../lib/api';
import { useLang } from '../lib/i18n';

// Light top navigation for the DISTRIBUTOR area. Distributors never see the
// owner/consumer chrome (Nav.js / CustomerShell) — this is their own, smaller
// shell: brand + three destinations + language switch + logout. Reuses the
// shared .nav styling so it matches the rest of the app and stays RTL-safe.
export default function DistNav() {
  const router = useRouter();
  const { t } = useLang();

  const logout = () => {
    window.localStorage.removeItem('skhata_token');
    window.localStorage.removeItem('skhata_role');
    clearApiCache();
    router.push('/login');
  };

  return (
    <div className="nav">
      <strong>Smart Digital Khata</strong>
      <Link href="/distributor">{t('dist.navHome')}</Link>
      <Link href="/distributor/shops">{t('dist.navShops')}</Link>
      <Link href="/distributor/account">{t('dist.navAccount')}</Link>
      <span className="badge">{t('dist.brand')}</span>
      <span style={{ flex: 1 }} />
      <LangSwitch />
      <button className="secondary" onClick={logout}>{t('nav.logout')}</button>
    </div>
  );
}
