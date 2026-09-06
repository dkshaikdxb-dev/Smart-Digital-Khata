import Link from 'next/link';
import { useLang } from '../lib/i18n';

// Sub-navigation for the owner "Suppliers" surface: Discover / My orders /
// What I owe. Reuses the catalogue's .cat-tabs pill styling so it matches the
// rest of the owner app. `active` is one of 'discover' | 'orders' | 'ledger'.
export default function SupplierTabs({ active }) {
  const { t } = useLang();
  const tabs = [
    { key: 'discover', href: '/suppliers', label: t('sup.tabDiscover') },
    { key: 'orders', href: '/suppliers/orders', label: t('sup.tabOrders') },
    { key: 'ledger', href: '/suppliers/ledger', label: t('sup.tabLedger') },
  ];
  return (
    <div className="cat-tabs">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`cat-tab${active === tab.key ? ' active' : ''}`}
          style={{ display: 'inline-block', padding: '8px 14px', borderRadius: 8, fontWeight: 600 }}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
