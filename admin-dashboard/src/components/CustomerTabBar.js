import Link from 'next/link';
import { useRouter } from 'next/router';
import { clearCustomerToken } from '../lib/customerApi';

// Fixed bottom tab bar for the logged-in customer pages. Mobile-first, sits
// inside the `.cpwa` wrapper so its styles are scoped and never touch the
// owner app. Tabs: Shops / Orders / Khata / Logout.
export default function CustomerTabBar() {
  const router = useRouter();
  const path = router.pathname;

  const isActive = (base) => path === base || path.startsWith(base + '/');

  const logout = () => {
    clearCustomerToken();
    router.replace('/c/login');
  };

  return (
    <nav className="cpwa-tabbar" aria-label="Customer navigation">
      <Link href="/c/shops" className={isActive('/c/shops') || isActive('/c/shop') ? 'active' : ''}>
        <span className="cpwa-tab-ico">🏪</span>
        <span>Shops</span>
      </Link>
      <Link href="/c/orders" className={isActive('/c/orders') ? 'active' : ''}>
        <span className="cpwa-tab-ico">📦</span>
        <span>Orders</span>
      </Link>
      <Link href="/c/khata" className={isActive('/c/khata') ? 'active' : ''}>
        <span className="cpwa-tab-ico">📒</span>
        <span>Khata</span>
      </Link>
      <button type="button" onClick={logout}>
        <span className="cpwa-tab-ico">🚪</span>
        <span>Logout</span>
      </button>
    </nav>
  );
}
