// Per-shop cart, persisted in localStorage so it survives navigation. A cart
// is scoped to ONE shop at a time: each shop gets its own key, and the "active"
// shop pointer tells the cart page which shop to review. Money is paise.
const KEY = (shopId) => `ckhata_cart_${shopId}`;
const ACTIVE_KEY = 'ckhata_active_shop';

// Broadcast a same-tab signal so the cart tab badge (and any other listener)
// can recompute its count immediately. `storage` events only fire in OTHER
// tabs, so we dispatch our own event for the tab that made the change.
export const CART_EVENT = 'ckhata-cart';
function emitCartChanged() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(CART_EVENT));
  } catch {
    /* very old browsers — badge just won't live-update */
  }
}

// Shape stored per shop:
// { shop_id, shop_name, items: { [product_id]: { product_id, name, unit, price, quantity } } }

export function loadCart(shopId) {
  if (typeof window === 'undefined' || !shopId) return null;
  try {
    const raw = window.localStorage.getItem(KEY(shopId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.items) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCart(cart) {
  if (typeof window === 'undefined' || !cart || !cart.shop_id) return;
  try {
    const count = Object.keys(cart.items || {}).length;
    if (count === 0) {
      window.localStorage.removeItem(KEY(cart.shop_id));
      const active = window.localStorage.getItem(ACTIVE_KEY);
      if (active === cart.shop_id) window.localStorage.removeItem(ACTIVE_KEY);
      emitCartChanged();
      return;
    }
    window.localStorage.setItem(KEY(cart.shop_id), JSON.stringify(cart));
    window.localStorage.setItem(ACTIVE_KEY, cart.shop_id);
    emitCartChanged();
  } catch {
    /* storage blocked */
  }
}

export function clearCart(shopId) {
  if (typeof window === 'undefined' || !shopId) return;
  try {
    window.localStorage.removeItem(KEY(shopId));
    const active = window.localStorage.getItem(ACTIVE_KEY);
    if (active === shopId) window.localStorage.removeItem(ACTIVE_KEY);
    emitCartChanged();
  } catch {
    /* ignore */
  }
}

export function getActiveShopId() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

// The one other shop that currently holds a non-empty cart, if any. Used to
// warn a customer who starts adding items at a different shop.
export function otherActiveCartShopId(shopId) {
  const active = getActiveShopId();
  if (active && active !== shopId) {
    const cart = loadCart(active);
    if (cart && Object.keys(cart.items || {}).length > 0) return active;
  }
  return null;
}

export function cartTotals(cart) {
  const items = cart ? Object.values(cart.items || {}) : [];
  const count = items.reduce((n, it) => n + Number(it.quantity || 0), 0);
  const subtotal = items.reduce((s, it) => s + Number(it.price || 0) * Number(it.quantity || 0), 0);
  return { count, subtotal, lines: items };
}
