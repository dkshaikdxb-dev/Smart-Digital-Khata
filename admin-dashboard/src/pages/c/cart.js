import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import CustomerShell, { money } from '../../components/CustomerShell';
import { customerFetch, getCustomerToken } from '../../lib/customerApi';
import { loadCart, saveCart, clearCart, cartTotals, getActiveShopId } from '../../lib/customerCart';
import { useLang } from '../../lib/i18n';

// Review & place order. Login is required only at submit time — an anonymous
// customer can build a cart and is sent to /c/login (preserving intent) when
// they place the order.
export default function Cart() {
  const router = useRouter();
  const { t } = useLang();
  const shopId = typeof router.query.shop === 'string' ? router.query.shop : null;
  const [cart, setCart] = useState(null);
  const [ready, setReady] = useState(false);
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
        items: lines.map((l) => ({ product_id: l.product_id, quantity: Number(l.quantity) })),
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
            <div className="cpwa-cart-line-info">
              <div>{l.name}</div>
              <div className="muted">{money(l.price)} / {l.unit || t('c.unit')}</div>
            </div>
            <div className="cpwa-stepper">
              <button type="button" className="secondary" onClick={() => setQty(l.product_id, l.quantity - 1)} aria-label="Decrease">−</button>
              <span className="cpwa-qty">{l.quantity}</span>
              <button type="button" className="secondary" onClick={() => setQty(l.product_id, l.quantity + 1)} aria-label="Increase">+</button>
            </div>
            <div className="cpwa-cart-line-total">{money(l.price * l.quantity)}</div>
          </div>
        ))}
        <div className="cpwa-row-between cpwa-subtotal">
          <strong>{t('common.subtotal')}</strong>
          <strong>{money(subtotal)}</strong>
        </div>
      </div>

      <div className="card">
        <div className="cpwa-label">{t('c.fulfillment')}</div>
        <div className="cpwa-seg">
          <button type="button" className={fulfillment === 'pickup' ? 'active' : ''} onClick={() => setFulfillment('pickup')}>{t('c.pickup')}</button>
          <button type="button" className={fulfillment === 'delivery' ? 'active' : ''} onClick={() => setFulfillment('delivery')}>{t('c.delivery')}</button>
        </div>
        {fulfillment === 'delivery' && (
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
        <div className="cpwa-seg">
          <button type="button" className={payment === 'credit' ? 'active' : ''} onClick={() => setPayment('credit')}>{t('c.onKhata')}</button>
          <button type="button" className={payment === 'prepaid' ? 'active' : ''} onClick={() => setPayment('prepaid')}>{t('c.payOnline')}</button>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          {payment === 'credit'
            ? t('c.creditNote')
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
          <div className="cpwa-cartbar-total">{money(subtotal)}</div>
        </div>
        <button type="button" className="cpwa-cartbar-btn" onClick={placeOrder} disabled={placing}>
          {placing ? t('c.placing') : t('c.placeOrder')}
        </button>
      </div>
    </CustomerShell>
  );
}
