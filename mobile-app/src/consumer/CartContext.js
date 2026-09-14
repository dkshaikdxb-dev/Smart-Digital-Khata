import React, {
  createContext, useContext, useState, useCallback, useMemo, useEffect, useRef,
} from 'react';
import { Alert } from 'react-native';
import { useT } from './i18n';
import { restoreCart, saveCart, clearCart as clearStoredCart } from './lib/cartStorage';

// The consumer cart, scoped to ONE shop at a time (same rule as the web PWA).
//
// It is PERSISTED. It used to be a bare useState(null) that lived for the app
// session, which meant Android reclaiming a backgrounded app silently threw
// away a half-built order — the shopper came back to an empty basket with no
// hint that anything had been there. Now every change is written per shop to
// expo-secure-store behind lib/cartStorage.js, with an active-shop pointer, and
// the cart is restored on launch.
//
// Two things that matter more than the persistence itself:
//   - Restoring is a STATE, not a silence. `status` is 'restoring' until the
//     read finishes, so the Cart screen can say "getting your basket" instead
//     of showing the empty-basket illustration to someone who has ten items.
//   - A failed write NEVER blocks a tap. Persisting is fire-and-forget: the
//     in-memory cart updates first and the write chases it. Worst case the
//     shopper loses the cart only if the app dies, which is exactly where they
//     were before.
//
// item shape: { product_id, name, unit, price(paise), image_url, sold_by_weight?,
//               weight_grams?, quantity }
const CartContext = createContext(null);

// Line total in integer paise. Weighed items: round(pricePerKg * grams / 1000);
// unit items: price * quantity. Matches the server's weighedLineTotal exactly.
export function lineTotalPaise(item) {
  if (!item) return 0;
  if (item.sold_by_weight) {
    return Math.round((Number(item.price) * Number(item.weight_grams || 0)) / 1000);
  }
  return Number(item.price) * Number(item.quantity || 0);
}

function itemCount(cart) {
  if (!cart) return 0;
  return Object.keys(cart.items || {}).length;
}

export function CartProvider({ children }) {
  const { t } = useT();
  // cart = { shop_id, shop_name, items: { [productId]: item } } | null
  const [cart, setCart] = useState(null);
  // 'restoring' while the saved cart is being read, then 'ready'. Screens use
  // this to tell "still loading" apart from "genuinely empty".
  const [status, setStatus] = useState('restoring');

  // The latest cart, readable synchronously. The shop-switch prompt and the
  // persistence effect both need "what is in the cart right now" outside of a
  // setState updater.
  const cartRef = useRef(null);
  cartRef.current = cart;

  // The shop the last persisted cart belonged to, so emptying the cart can
  // delete the right key.
  const persistedShopRef = useRef(null);

  // Restore on launch. Any failure (absent, corrupt, storage blocked) lands on
  // an empty cart — never a crash and never a stuck spinner.
  useEffect(() => {
    let alive = true;
    restoreCart()
      .then((saved) => {
        if (!alive) return;
        if (saved && itemCount(saved) > 0) {
          persistedShopRef.current = saved.shop_id;
          setCart(saved);
        }
      })
      .catch(() => { /* start empty */ })
      .then(() => { if (alive) setStatus('ready'); });
    return () => { alive = false; };
  }, []);

  // ONE place writes to storage: this effect, reacting to the cart the shopper
  // can already see. Keeping the writes out of the state updaters means no
  // updater has a side effect (React is free to call those more than once) and
  // every mutation — add, quantity, weight, clear, order placed — is persisted
  // by the same two lines.
  //
  // Deliberately NOT awaited anywhere: storage is best effort and must never
  // sit between a tap and the number on screen changing. Skipped while
  // restoring so the initial null cannot erase the value being read.
  useEffect(() => {
    if (status !== 'ready') return;
    if (cart && cart.shop_id) {
      persistedShopRef.current = cart.shop_id;
      saveCart(cart).catch(() => { /* best effort */ });
      return;
    }
    const gone = persistedShopRef.current;
    if (gone) {
      persistedShopRef.current = null;
      clearStoredCart(gone).catch(() => { /* best effort */ });
    }
  }, [cart, status]);

  // Empty the working cart. The effect above removes it from storage.
  const clear = useCallback(() => setCart(null), []);

  // Ensure the working cart is for `shop`; switching shops replaces it.
  const ensureShop = useCallback((shopId, shopName) => {
    setCart((c) => {
      if (c && c.shop_id === shopId) return c;
      return { shop_id: shopId, shop_name: shopName, items: {} };
    });
  }, []);

  // A cart belongs to one shop. Adding at a DIFFERENT shop used to silently
  // replace the whole basket — no prompt, no undo, and the shopper only found
  // out when they opened the cart. The web asks first, with this exact
  // sentence, so we ask with it too. `proceed` runs only on confirm; on cancel
  // nothing changes at all.
  const withShopGuard = useCallback((shopId, proceed) => {
    const current = cartRef.current;
    const hasOtherCart = current && current.shop_id !== shopId && itemCount(current) > 0;
    if (!hasOtherCart) { proceed(); return; }
    const otherShopId = current.shop_id;
    Alert.alert(
      t('cart.switchShopTitle'),
      t('cart.switchShopConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('cart.switchShopClear'),
          style: 'destructive',
          onPress: () => {
            clearStoredCart(otherShopId).catch(() => {});
            proceed();
          },
        },
      ],
      { cancelable: true },
    );
  }, [t]);

  const addUnit = useCallback((shopId, shopName, product) => {
    withShopGuard(shopId, () => {
      setCart((c) => {
        const base = c && c.shop_id === shopId ? c : { shop_id: shopId, shop_name: shopName, items: {} };
        const items = { ...base.items };
        const existing = items[product.id];
        items[product.id] = {
          product_id: product.id,
          name: product.name,
          unit: product.unit,
          price: Number(product.price || 0),
          image_url: product.image_url || '',
          quantity: existing ? Number(existing.quantity) + 1 : 1,
        };
        return { shop_id: shopId, shop_name: shopName, items };
      });
    });
  }, [withShopGuard]);

  const setQty = useCallback((productId, qty) => {
    setCart((c) => {
      if (!c) return c;
      const items = { ...c.items };
      if (qty <= 0) delete items[productId];
      else items[productId] = { ...items[productId], quantity: qty };
      // Emptying the last line drops the cart entirely, so the persistence
      // effect takes the storage key and the active-shop pointer with it.
      if (Object.keys(items).length === 0) return null;
      return { ...c, items };
    });
  }, []);

  const setWeight = useCallback((shopId, shopName, product, grams) => {
    const g = Number(grams);
    // Removing a weight is never a shop switch — it can only touch a line that
    // already belongs to this shop's cart, so it skips the prompt.
    if (!g || g <= 0) {
      setCart((c) => {
        if (!c || c.shop_id !== shopId) return c;
        const items = { ...c.items };
        delete items[product.id];
        if (Object.keys(items).length === 0) return null;
        return { ...c, items };
      });
      return;
    }
    withShopGuard(shopId, () => {
      setCart((c) => {
        const base = c && c.shop_id === shopId ? c : { shop_id: shopId, shop_name: shopName, items: {} };
        const items = { ...base.items };
        items[product.id] = {
          product_id: product.id,
          name: product.name,
          unit: product.unit,
          price: Number(product.price || 0), // paise per KG
          image_url: product.image_url || '',
          sold_by_weight: true,
          weight_grams: g,
          quantity: 1,
        };
        return { shop_id: shopId, shop_name: shopName, items };
      });
    });
  }, [withShopGuard]);

  const totals = useMemo(() => {
    const lines = cart ? Object.values(cart.items) : [];
    const count = lines.reduce((n, l) => n + Number(l.quantity || 0), 0);
    const subtotal = lines.reduce((s, l) => s + lineTotalPaise(l), 0);
    return { lines, count, subtotal };
  }, [cart]);

  const value = useMemo(() => ({
    cart, status, restoring: status === 'restoring',
    clear, ensureShop, addUnit, setQty, setWeight, ...totals,
  }), [cart, status, clear, ensureShop, addUnit, setQty, setWeight, totals]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  return useContext(CartContext);
}
