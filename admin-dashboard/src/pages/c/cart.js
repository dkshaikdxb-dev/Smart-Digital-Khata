import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import CustomerShell, { money } from '../../components/CustomerShell';
import ProductThumb from '../../components/ProductThumb';
import { customerFetch, getCustomerToken, publicFetch } from '../../lib/customerApi';
import { loadCart, saveCart, clearCart, cartTotals, getActiveShopId, lineTotalPaise } from '../../lib/customerCart';
import { useLang } from '../../lib/i18n';

// Human label for a weight in grams: "250 g" or "1 kg".
function gramsLabel(g) {
  const n = Number(g) || 0;
  return n % 1000 === 0 ? `${n / 1000} kg` : `${n} g`;
}

// Review & place order. Login is required only at submit time — an anonymous
// customer can build a cart and is sent to /c/login (preserving intent) when
// they place the order.
export default function Cart() {
  const router = useRouter();
  const { t } = useLang();
  const shopId = typeof router.query.shop === 'string' ? router.query.shop : null;
  const [cart, setCart] = useState(null);
  const [ready, setReady] = useState(false);
  const [shop, setShop] = useState(null); // fulfillment settings for this cart's shop
  const [fulfillment, setFulfillment] = useState('pickup');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [payment, setPayment] = useState('credit');
  const [error, setError] = useState('');
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    const id = shopId || getActiveShopId();
    setCart(id ? loadCart(id) : null);
    setReady(true);
  }, [router.isReady, shopId]);

  const activeShopId = cart?.shop_id || shopId;
  const { count, subtotal, lines } = cartTotals(cart);

  // Fetch the shop's fulfillment settings so the checkout offers only what the
  // shop supports and previews the same delivery fee the server will charge.
  useEffect(() => {
    if (!activeShopId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await publicFetch(`/api/public/shops/${activeShopId}`);
        if (!cancelled) setShop(r.shop || r);
      } catch {
        // No live shop info (offline / not listed) — fall back to both options,
        // no fee, no minimum. The server stays authoritative at submit time.
        if (!cancelled) setShop(null);
      }
    })();
    return () => { cancelled = true; };
  }, [activeShopId]);

  // Which fulfillment options this shop offers. If the shop specifies at least
  // one, honor it exactly; otherwise (unknown shop or none set) allow both.
  let offersPickup = true;
  let offersDelivery = true;
  if (shop && (shop.offers_pickup || shop.offers_delivery)) {
    offersPickup = !!shop.offers_pickup;
    offersDelivery = !!shop.offers_delivery;
  }

  // Keep the selected option valid for what the shop offers.
  useEffect(() => {
    if (!offersDelivery && fulfillment === 'delivery') setFulfillment('pickup');
    else if (!offersPickup && fulfillment === 'pickup') setFulfillment('delivery');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offersPickup, offersDelivery]);

  // Delivery fee preview — mirrors the server: free when free_delivery_min is set
  // and the subtotal reaches it, otherwise the flat delivery_fee. Pickup = no fee.
  const deliveryFeeBase = Number(shop?.delivery_fee || 0);
  const freeMin = shop && shop.free_delivery_min != null ? Number(shop.free_delivery_min) : null;
  const minOrder = Number(shop?.delivery_min_order || 0);
  const isDelivery = fulfillment === 'delivery';
  const isFree = freeMin != null && subtotal >= freeMin;
  const fee = isDelivery ? (isFree ? 0 : deliveryFeeBase) : 0;
  const total = subtotal + fee;
  const belowMin = isDelivery && minOrder > 0 && subtotal < minOrder;
  const freeGap = isDelivery && freeMin != null && subtotal < freeMin ? freeMin - subtotal : 0;
  const canPlace = !placing && !belowMin;

  function persist(nextCart) {
    setCart(nextCart);
    saveCart(nextCart);
  }

  function setQty(productId, qty) {
    const items = { ...(cart?.items || {}) };
    if (qty <= 0) delete items[productId];
    else items[productId] = { ...items[productId], quantity: qty };
    persist({ ...cart, items });
  }

  async function placeOrder() {
    setError('');
    if (belowMin) return; // guarded by disabled button; belt-and-braces
    // Gate at submit — preserve the intent to return here.
    if (!getCustomerToken()) {
      const next = encodeURIComponent(`/c/cart?shop=${activeShopId}`);
      router.push(`/c/login?next=${next}`);
      return;
    }
    if (fulfillment === 'delivery' && !address.trim()) {
      setError(t('c.deliveryAddressRequired'));
      return;
    }
    setPlacing(true);
    try {
      const body = {
        shop_id: activeShopId,
        items: lines.map((l) => (l.sold_by_weight
          ? { product_id: l.product_id, weight_grams: Number(l.weight_grams) }
          : { product_id: l.product_id, quantity: Number(l.quantity) })),
        fulfillment_type: fulfillment,
        payment_mode: payment,
        address: fulfillment === 'delivery' ? address.trim() : '',
        note: note.trim(),
      };
      const r = await customerFetch('/api/my/orders', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const order = r.order || r;
      const payLink = r.pay_link || r.link || r.payment_link;
      // Clear the cart either way — the order now lives on the server.
      clearCart(activeShopId);
      if (payment === 'prepaid' && payLink) {
        window.location.href = payLink;
        return;
      }
      const orderId = order?.id || r.order_id;
      router.replace(orderId ? `/c/orders/${orderId}` : '/c/orders');
    } catch (err) {
      // Surface the server's message (e.g. a rejected minimum order).
      setError(err.message);
      setPlacing(false);
    }
  }

  if (ready && (!cart || count === 0)) {
    return (
      <CustomerShell title={t('c.yourCart')} back="/c/shops">
        <div className="card cpwa-empty">
          <div className="cpwa-empty-ico">🛒</div>
          <p className="muted">{t('c.cartEmpty')}</p>
          <Link href="/c/shops"><button>{t('c.browseShops')}</button></Link>
        </div>
      </CustomerShell>
    );
  }

  return (
    <CustomerShell title={t('c.yourCart')} back={activeShopId ? `/c/shop/${activeShopId}` : '/c/shops'}>
      {cart?.shop_name && (
        <div className="card"><strong>{cart.shop_name}</strong></div>
      )}

      <div className="card">
        {lines.map((l) => (
          <div key={l.product_id} className="cpwa-cart-line">
            <ProductThumb product={l} size={40} />
            <div className="cpwa-cart-line-info">
              <div>{l.name}</div>
              {l.sold_by_weight ? (
                <div className="muted">{money(l.price)} {t('loose.perKg')} · {gramsLabel(l.weight_grams)}</div>
              ) : (
                <div className="muted">{money(l.price)} / {l.unit || t('c.unit')}</div>
              )}
            </div>
            {l.sold_by_weight ? (
              <div className="cpwa-cart-weight">
                <span className="cpwa-weight-tag">{gramsLabel(l.weight_grams)}</span>
                <button type="button" className="secondary cpwa-weight-remove" onClick={() => setQty(l.product_id, 0)} aria-label={t('common.remove')}>×</button>
              </div>
            ) : (
              <div className="cpwa-stepper">
                <button type="button" className="secondary" onClick={() => setQty(l.product_id, l.quantity - 1)} aria-label="Decrease">−</button>
                <span className="cpwa-qty">{l.quantity}</span>
                <button type="button" className="secondary" onClick={() => setQty(l.product_id, l.quantity + 1)} aria-label="Increase">+</button>
              </div>
            )}
            <div className="cpwa-cart-line-total">{money(lineTotalPaise(l))}</div>
          </div>
        ))}
        <div className="cpwa-row-between cpwa-subtotal">
          <span>{t('common.subtotal')}</span>
          <span>{money(subtotal)}</span>
        </div>
        {isDelivery && offersDelivery && (
          <div className="cpwa-row-between" style={{ marginTop: 8 }}>
            <span>{t('c.deliveryFee')}</span>
            <span>{isFree ? t('c.freeDelivery') : money(fee)}</span>
          </div>
        )}
        <div className="cpwa-row-between cpwa-total">
          <strong>{t('c.total')}</strong>
          <strong>{money(total)}</strong>
        </div>
      </div>

      <div className="card">
        <div className="cpwa-label">{t('c.fulfillment')}</div>
        <div className="cpwa-seg">
          {offersPickup && (
            <button type="button" className={fulfillment === 'pickup' ? 'active' : ''} onClick={() => setFulfillment('pickup')}>{t('c.pickup')}</button>
          )}
          {offersDelivery && (
            <button type="button" className={fulfillment === 'delivery' ? 'active' : ''} onClick={() => setFulfillment('delivery')}>{t('c.delivery')}</button>
          )}
        </div>
        {isDelivery && shop && shop.delivery_hours && (
          <p className="muted" style={{ marginTop: 8 }}>{t('c.deliveryHoursLabel', { hours: shop.delivery_hours })}</p>
        )}
        {isDelivery && freeGap > 0 && (
          <p className="muted" style={{ marginTop: 8 }}>{t('c.addForFree', { amt: money(freeGap) })}</p>
        )}
        {belowMin && (
          <p className="cpwa-error" style={{ marginTop: 8 }}>{t('c.minOrder', { amt: money(minOrder) })}</p>
        )}
        {isDelivery && (
          <div style={{ marginTop: 12 }}>
            <label className="cpwa-label" htmlFor="addr">{t('c.deliveryAddress')}</label>
            <textarea
              id="addr"
              className="cpwa-textarea"
              placeholder={t('c.addressPlaceholder')}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="card">
        <div className="cpwa-label">{t('c.payment')}</div>
        <div className="cpwa-seg cpwa-seg-wrap">
          <button type="button" className={payment === 'credit' ? 'active' : ''} onClick={() => setPayment('credit')}>{t('c.onKhata')}</button>
          <button type="button" className={payment === 'prepaid' ? 'active' : ''} onClick={() => setPayment('prepaid')}>{t('c.payOnline')}</button>
          <button type="button" className={payment === 'cash' ? 'active' : ''} onClick={() => setPayment('cash')}>{t('c.payCash')}</button>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          {payment === 'credit'
            ? t('c.creditNote')
            : payment === 'cash'
              ? t('c.payCashHint')
              : t('c.prepaidNote')}
        </p>
      </div>

      <div className="card">
        <label className="cpwa-label" htmlFor="note">{t('c.noteForShop')}</label>
        <input id="note" type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('c.notePlaceholderArrival')} />
      </div>

      {error && <div className="card cpwa-error">{error}</div>}

      <div className="cpwa-cartbar">
        <div>
          <div className="cpwa-cartbar-count">{t('common.itemCount', { n: count, s: count > 1 ? 's' : '' })}</div>
          <div className="cpwa-cartbar-total">{money(total)}</div>
        </div>
        <button type="button" className="cpwa-cartbar-btn" onClick={placeOrder} disabled={!canPlace}>
          {placing ? t('c.placing') : t('c.placeOrder')}
        </button>
      </div>
    </CustomerShell>
  );
}
