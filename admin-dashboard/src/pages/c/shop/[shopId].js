import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import CustomerShell, { money } from '../../../components/CustomerShell';
import ProductThumb from '../../../components/ProductThumb';
import { publicFetch } from '../../../lib/customerApi';
import { loadCart, saveCart, cartTotals, otherActiveCartShopId, clearCart } from '../../../lib/customerCart';
import { useLang } from '../../../lib/i18n';

// Shop catalog + per-shop cart. Adding items persists to localStorage keyed by
// shop. A customer can only build a cart for ONE shop at a time.
export default function ShopCatalog() {
  const router = useRouter();
  const { t } = useLang();
  const { shopId } = router.query;
  const [shop, setShop] = useState(null);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState(''); // '' = all categories

  useEffect(() => {
    if (!shopId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const r = await publicFetch(`/api/public/shops/${shopId}`);
        const s = r.shop || r;
        if (cancelled) return;
        setShop(s);
        setProducts(s.products || r.products || []);
        setCart(loadCart(shopId) || { shop_id: shopId, shop_name: s.name, items: {} });
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [shopId]);

  function persist(nextCart) {
    setCart(nextCart);
    saveCart(nextCart);
  }

  function addItem(p) {
    // A cart is per-shop: warn if another shop already holds items.
    const other = otherActiveCartShopId(shopId);
    if (other) {
      const ok = window.confirm(t('c.switchCartConfirm'));
      if (!ok) return;
      clearCart(other);
    }
    const items = { ...(cart?.items || {}) };
    const existing = items[p.id];
    items[p.id] = {
      product_id: p.id,
      name: p.name,
      unit: p.unit,
      price: Number(p.price || 0),
      image_url: p.image_url || '',
      quantity: existing ? existing.quantity + 1 : 1,
    };
    persist({ shop_id: shopId, shop_name: shop?.name, items });
  }

  function setQty(p, qty) {
    const items = { ...(cart?.items || {}) };
    if (qty <= 0) {
      delete items[p.id];
    } else {
      items[p.id] = {
        product_id: p.id,
        name: p.name,
        unit: p.unit,
        price: Number(p.price || 0),
        image_url: p.image_url || '',
        quantity: qty,
      };
    }
    persist({ shop_id: shopId, shop_name: shop?.name, items });
  }

  const { count, subtotal } = cartTotals(cart);

  // Distinct catalog categories present in THIS shop's products (ignore null).
  const categories = useMemo(() => {
    const seen = [];
    for (const p of products) {
      const c = p.category;
      if (c && !seen.includes(c)) seen.push(c);
    }
    return seen;
  }, [products]);

  // Client-side filter: bounded list, so search + category are cheap.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (activeCat && p.category !== activeCat) return false;
      if (q && !String(p.name || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, search, activeCat]);

  // Compact fulfillment summary derived from the shop's settings.
  function fulfillmentSummary(s) {
    const lines = [];
    if (s.offers_delivery) {
      let d = `🛵 ${t('c.delivery')} ${money(s.delivery_fee)}`;
      if (s.free_delivery_min != null) d += ` · ${t('c.freeAboveAmt', { amt: money(s.free_delivery_min) })}`;
      if (s.offers_pickup) d += ` · 🏬 ${t('c.pickup')}`;
      lines.push(d);
    } else if (s.offers_pickup) {
      lines.push(`🏬 ${t('c.pickupOnly')}`);
    }
    if (s.offers_delivery && s.delivery_hours) {
      lines.push(t('c.deliveryHoursLabel', { hours: s.delivery_hours }));
    }
    return lines;
  }

  return (
    <CustomerShell title={shop ? shop.name : t('c.shop')} back="/c/shops">
      {error && <div className="card cpwa-error">{error}</div>}
      {loading && <div className="card">{t('c.loadingCatalog')}</div>}

      {shop && (
        <div className="card">
          <div className="muted">{[shop.area, shop.city].filter(Boolean).join(', ') || t('c.locationNotSet')}</div>
          {fulfillmentSummary(shop).map((line, i) => (
            <div key={i} className="cpwa-ful-summary">{line}</div>
          ))}
        </div>
      )}

      {shop && products.length > 0 && (
        <div className="card">
          <div className="cpwa-search">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('c.searchProducts')}
              aria-label={t('c.searchProducts')}
            />
          </div>
          {categories.length > 0 && (
            <div className="cpwa-chips" role="group" aria-label={t('c.category')}>
              <button type="button" className={`cpwa-chip ${activeCat === '' ? 'active' : ''}`} onClick={() => setActiveCat('')}>
                {t('c.allCategories')}
              </button>
              {categories.map((c) => (
                <button key={c} type="button" className={`cpwa-chip ${activeCat === c ? 'active' : ''}`} onClick={() => setActiveCat(c)}>
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && products.length === 0 && !error && (
        <div className="card muted">{t('c.noItems')}</div>
      )}

      {!loading && products.length > 0 && visible.length === 0 && (
        <div className="card muted">{t('cat.noResults')}</div>
      )}

      {visible.map((p) => {
        const inCart = cart?.items?.[p.id];
        return (
          <div key={p.id} className="card cpwa-product">
            <ProductThumb product={p} />
            <div className="cpwa-product-info">
              <div className="cpwa-product-name">{p.name}</div>
              {p.description && <div className="muted cpwa-clamp">{p.description}</div>}
              <div className="cpwa-product-price">
                {money(p.price)} <span className="muted">/ {p.unit || t('c.unit')}</span>
              </div>
            </div>
            <div className="cpwa-product-action">
              {inCart ? (
                <div className="cpwa-stepper">
                  <button type="button" className="secondary" onClick={() => setQty(p, inCart.quantity - 1)} aria-label="Decrease">−</button>
                  <span className="cpwa-qty">{inCart.quantity}</span>
                  <button type="button" className="secondary" onClick={() => setQty(p, inCart.quantity + 1)} aria-label="Increase">+</button>
                </div>
              ) : (
                <button type="button" onClick={() => addItem(p)}>{t('common.add')}</button>
              )}
            </div>
          </div>
        );
      })}

      {count > 0 && (
        <div className="cpwa-cartbar">
          <div>
            <div className="cpwa-cartbar-count">{t('common.itemCount', { n: count, s: count > 1 ? 's' : '' })}</div>
            <div className="cpwa-cartbar-total">{money(subtotal)}</div>
          </div>
          <Link href={`/c/cart?shop=${shopId}`} className="cpwa-cartbar-btn">{t('c.reviewOrder')}</Link>
        </div>
      )}
    </CustomerShell>
  );
}
