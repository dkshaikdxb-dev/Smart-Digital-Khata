import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { clearCustomerToken } from '../lib/customerApi';
import { clearApiCache } from '../lib/api';
import { getActiveShopId, loadCart, cartTotals, CART_EVENT } from '../lib/customerCart';
import { useLang } from '../lib/i18n';

// Fixed bottom tab bar for the logged-in customer pages. Mobile-first, sits
// inside the `.cpwa` wrapper so its styles are scoped and never touch the
// owner app. Tabs: Shops / Cart / Orders / Khata / Logout.
export default function CustomerTabBar() {
  const router = useRouter();
  const { t } = useLang();
  const path = router.pathname;

  // Live item count for the cart badge. SSR-safe: start at 0 and fill in on
  // mount so server and client markup match. Recompute on our same-tab cart
  // event and on cross-tab storage changes.
  const [cartCount, setCartCount] = useState(0);
  useEffect(() => {
    const recompute = () => {
      const id = getActiveShopId();
      const { count } = cartTotals(id ? loadCart(id) : null);
      setCartCount(count || 0);
    };
    recompute();
    window.addEventListener(CART_EVENT, recompute);
    window.addEventListener('storage', recompute);
    return () => {
      window.removeEventListener(CART_EVENT, recompute);
      window.removeEventListener('storage', recompute);
    };
  }, []);

  const isActive = (base) => path === base || path.startsWith(base + '/');

  const logout = () => {
    clearCustomerToken();
    // Drop cached API responses so a shared device doesn't leak this user's data.
    clearApiCache();
    router.replace('/c/login');
  };

  return (
    <nav className="cpwa-tabbar cpwa-tabbar-5" aria-label="Customer navigation">
      <Link href="/c/shops" className={isActive('/c/shops') || isActive('/c/shop') ? 'active' : ''}>
        <span className="cpwa-tab-ico">🏪</span>
        <span>{t('ctab.shops')}</span>
      </Link>
      <Link href="/c/cart" className={isActive('/c/cart') ? 'active' : ''}>
        <span className="cpwa-tab-ico cpwa-tab-badgewrap">
          🛒
          {cartCount > 0 && (
            <span className="cpwa-tab-badge" aria-hidden="true">{cartCount > 99 ? '99+' : cartCount}</span>
          )}
        </span>
        <span>{t('ctab.cart')}</span>
      </Link>
      <Link href="/c/orders" className={isActive('/c/orders') ? 'active' : ''}>
        <span className="cpwa-tab-ico">📦</span>
        <span>{t('ctab.orders')}</span>
      </Link>
      <Link href="/c/khata" className={isActive('/c/khata') ? 'active' : ''}>
        <span className="cpwa-tab-ico">📒</span>
        <span>{t('ctab.khata')}</span>
      </Link>
      <button type="button" onClick={logout}>
        <span className="cpwa-tab-ico">🚪</span>
        <span>{t('ctab.logout')}</span>
      </button>
    </nav>
  );
}
