import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import CustomerShell, { money } from '../../../components/CustomerShell';
import { publicFetch } from '../../../lib/customerApi';
import { loadCart, saveCart, cartTotals, otherActiveCartShopId, clearCart } from '../../../lib/customerCart';

// Shop catalog + per-shop cart. Adding items persists to localStorage keyed by
// shop. A customer can only build a cart for ONE shop at a time.
export default function ShopCatalog() {
  const router = useRouter();
  const { shopId } = router.query;
  const [shop, setShop] = useState(null);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      const ok = window.confirm(
        'You have an unfinished cart at another shop. Clear it and start a cart here?'
      );
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
        quantity: qty,
      };
    }
    persist({ shop_id: shopId, shop_name: shop?.name, items });
  }

  const { count, subtotal } = cartTotals(cart);

  return (
    <CustomerShell title={shop ? shop.name : 'Shop'} back="/c/shops">
      {error && <div className="card cpwa-error">{error}</div>}
      {loading && <div className="card">Loading catalog…</div>}

      {shop && (
        <div className="card">
          <div className="muted">{[shop.area, shop.city].filter(Boolean).join(', ') || 'Location not set'}</div>
        </div>
      )}

      {!loading && products.length === 0 && !error && (
        <div className="card muted">This shop has no items listed yet.</div>
      )}

      {products.map((p) => {
        const inCart = cart?.items?.[p.id];
        return (
          <div key={p.id} className="card cpwa-product">
            <div className="cpwa-product-info">
              <div className="cpwa-product-name">{p.name}</div>
              {p.description && <div className="muted cpwa-clamp">{p.description}</div>}
              <div className="cpwa-product-price">
                {money(p.price)} <span className="muted">/ {p.unit || 'unit'}</span>
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
                <button type="button" onClick={() => addItem(p)}>Add</button>
              )}
            </div>
          </div>
        );
      })}

      {count > 0 && (
        <div className="cpwa-cartbar">
          <div>
            <div className="cpwa-cartbar-count">{count} item{count > 1 ? 's' : ''}</div>
            <div className="cpwa-cartbar-total">{money(subtotal)}</div>
          </div>
          <Link href={`/c/cart?shop=${shopId}`} className="cpwa-cartbar-btn">Review order ›</Link>
        </div>
      )}
    </CustomerShell>
  );
}
