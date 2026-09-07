import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

// A simple in-memory cart, scoped to ONE shop at a time (mirrors the web PWA:
// a customer builds a cart for a single shop). Nothing is persisted — it lives
// for the app session, which is enough for the browse -> review -> order flow.
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

export function CartProvider({ children }) {
  // cart = { shop_id, shop_name, items: { [productId]: item } } | null
  const [cart, setCart] = useState(null);

  const clear = useCallback(() => setCart(null), []);

  // Ensure the working cart is for `shop`; switching shops replaces it.
  const ensureShop = useCallback((shopId, shopName) => {
    setCart((c) => {
      if (c && c.shop_id === shopId) return c;
      return { shop_id: shopId, shop_name: shopName, items: {} };
    });
  }, []);

  const addUnit = useCallback((shopId, shopName, product) => {
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
  }, []);

  const setQty = useCallback((productId, qty) => {
    setCart((c) => {
      if (!c) return c;
      const items = { ...c.items };
      if (qty <= 0) delete items[productId];
      else items[productId] = { ...items[productId], quantity: qty };
      return { ...c, items };
    });
  }, []);

  const setWeight = useCallback((shopId, shopName, product, grams) => {
    setCart((c) => {
      const base = c && c.shop_id === shopId ? c : { shop_id: shopId, shop_name: shopName, items: {} };
      const items = { ...base.items };
      const g = Number(grams);
      if (!g || g <= 0) {
        delete items[product.id];
      } else {
        items[product.id] = {
          product_id: product.id,
          name: product.name,
          unit: product.unit,
          price: Number(product.price || 0),
          image_url: product.image_url || '',
          sold_by_weight: true,
          weight_grams: g,
          quantity: 1,
        };
      }
      return { shop_id: shopId, shop_name: shopName, items };
    });
  }, []);

  const totals = useMemo(() => {
    const lines = cart ? Object.values(cart.items) : [];
    const count = lines.reduce((n, l) => n + Number(l.quantity || 0), 0);
    const subtotal = lines.reduce((s, l) => s + lineTotalPaise(l), 0);
    return { lines, count, subtotal };
  }, [cart]);

  const value = useMemo(() => ({
    cart, clear, ensureShop, addUnit, setQty, setWeight, ...totals,
  }), [cart, clear, ensureShop, addUnit, setQty, setWeight, totals]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  return useContext(CartContext);
}
