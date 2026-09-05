import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import CustomerShell, { money } from '../../../components/CustomerShell';
import ProductThumb from '../../../components/ProductThumb';
import { publicFetch } from '../../../lib/customerApi';
import { loadCart, saveCart, cartTotals, otherActiveCartShopId, clearCart, lineTotalPaise } from '../../../lib/customerCart';
import { useLang } from '../../../lib/i18n';
import { useSpeech } from '../../../lib/useSpeech';

// Quick-pick weight chips (grams) offered for loose/weighed items.
const WEIGHT_CHIPS = [250, 500, 1000];
// Human label for a weight in grams: "250 g" or "1 kg".
function gramsLabel(g) {
  const n = Number(g) || 0;
  return n % 1000 === 0 ? `${n / 1000} kg` : `${n} g`;
}

// Shop catalog + per-shop cart. Adding items persists to localStorage keyed by
// shop. A customer can only build a cart for ONE shop at a time.
//
// Catalog-linked products carry a `base_product` (generic name), `brand` and
// `pack` (size). Rows that share a non-null base_product are folded into ONE
// "variant group" card where the shopper picks brand + size; each (brand,pack)
// is still its own real product row with its own id/price, so the cart, the
// stepper and checkout all operate on the resolved concrete product unchanged.
export default function ShopCatalog() {
  const router = useRouter();
  const { t } = useLang();
  const { sttSupported, listening, listen } = useSpeech();
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

  // Add/replace a loose/weighed item at the chosen weight (grams). A weighed item
  // is a single line (quantity 1); re-choosing a weight replaces it.
  function setWeight(p, grams) {
    const g = Number(grams);
    const items = { ...(cart?.items || {}) };
    if (!g || g <= 0) {
      delete items[p.id];
      persist({ shop_id: shopId, shop_name: shop?.name, items });
      return;
    }
    const other = otherActiveCartShopId(shopId);
    if (other && !items[p.id]) {
      const ok = window.confirm(t('c.switchCartConfirm'));
      if (!ok) return;
      clearCart(other);
    }
    items[p.id] = {
      product_id: p.id,
      name: p.name,
      unit: p.unit,
      price: Number(p.price || 0), // paise per KG
      image_url: p.image_url || '',
      sold_by_weight: true,
      weight_grams: g,
      quantity: 1,
    };
    persist({ shop_id: shopId, shop_name: shop?.name, items });
  }

  const { count, subtotal } = cartTotals(cart);

  // Distinct catalog categories present in THIS shop's products (ignore null).
  // A group inherits every category any of its variants carries, so iterating
  // the raw product rows already covers grouped variants.
  const categories = useMemo(() => {
    const seen = [];
    for (const p of products) {
      const c = p.category;
      if (c && !seen.includes(c)) seen.push(c);
    }
    return seen;
  }, [products]);

  // Fold products into display "units": rows sharing a non-null base_product
  // become one variant group (in first-seen order); everything else — null
  // base_product, or a group that ends up with a single row — is its own
  // single unit rendered exactly as before.
  const units = useMemo(() => {
    const groupIndex = new Map(); // base_product -> unit reference
    const list = [];
    for (const p of products) {
      const bp = p.base_product;
      if (bp) {
        let u = groupIndex.get(bp);
        if (!u) {
          u = { kind: 'group', key: `g_${bp}`, base: bp, variants: [] };
          groupIndex.set(bp, u);
          list.push(u);
        }
        u.variants.push(p);
      } else {
        list.push({ kind: 'single', key: `s_${p.id}`, product: p });
      }
    }
    // A group of one is indistinguishable from a plain product — collapse it.
    return list.map((u) =>
      u.kind === 'group' && u.variants.length === 1
        ? { kind: 'single', key: `s_${u.variants[0].id}`, product: u.variants[0] }
        : u
    );
  }, [products]);

  // Client-side filter over units: bounded list, so search + category are cheap.
  // Search matches name AND (for catalog-linked rows) base_product + brand; a
  // group stays visible if ANY of its variants matches.
  const visibleUnits = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (p) => {
      if (!q) return true;
      return [p.name, p.base_product, p.brand].some((f) =>
        String(f || '').toLowerCase().includes(q)
      );
    };
    return units.filter((u) => {
      if (u.kind === 'single') {
        const p = u.product;
        if (activeCat && p.category !== activeCat) return false;
        return matches(p);
      }
      if (activeCat && !u.variants.some((v) => v.category === activeCat)) return false;
      return u.variants.some(matches);
    });
  }, [units, search, activeCat]);

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

  // Add/stepper block for a resolved product `p` (shared by single + variant
  // cards). `inCart` is the current cart line for p, if any.
  function ProductAction({ p, inCart }) {
    return (
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
    );
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
          <div className="cpwa-search cpwa-search-voice">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('c.searchProducts')}
              aria-label={t('c.searchProducts')}
            />
            {sttSupported && (
              <button
                type="button"
                className={`secondary cpwa-mic${listening ? ' listening' : ''}`}
                onClick={() => listen((tx) => setSearch(tx))}
                aria-label={t('voice.listen')}
                title={listening ? t('voice.listening') : t('voice.listen')}
              >
                🎤
              </button>
            )}
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

      {!loading && products.length > 0 && visibleUnits.length === 0 && (
        <div className="card muted">{t('cat.noResults')}</div>
      )}

      {visibleUnits.map((u) => {
        if (u.kind === 'single') {
          const p = u.product;
          const inCart = cart?.items?.[p.id];
          if (p.sold_by_weight) {
            return (
              <div key={u.key} className="card cpwa-product-weighed">
                <div className="cpwa-product cpwa-vcard-top">
                  <ProductThumb product={p} />
                  <div className="cpwa-product-info">
                    <div className="cpwa-product-name">{p.name}</div>
                    {p.description && <div className="muted cpwa-clamp">{p.description}</div>}
                    <div className="cpwa-product-price">
                      {money(p.price)} <span className="muted">{t('loose.perKg')}</span>
                    </div>
                  </div>
                </div>
                <WeightPicker p={p} inCart={inCart} t={t} onSet={(g) => setWeight(p, g)} />
              </div>
            );
          }
          return (
            <div key={u.key} className="card cpwa-product">
              <ProductThumb product={p} />
              <div className="cpwa-product-info">
                <div className="cpwa-product-name">{p.name}</div>
                {p.description && <div className="muted cpwa-clamp">{p.description}</div>}
                <div className="cpwa-product-price">
                  {money(p.price)} <span className="muted">/ {p.unit || t('c.unit')}</span>
                </div>
              </div>
              <ProductAction p={p} inCart={inCart} />
            </div>
          );
        }
        return (
          <VariantCard
            key={u.key}
            unit={u}
            cart={cart}
            t={t}
            renderAction={(p, inCart) => <ProductAction p={p} inCart={inCart} />}
          />
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

// Weight picker for a loose/weighed product: quick chips (250g/500g/1kg) plus a
// custom grams input. Choosing a weight adds/updates the cart line; the computed
// line price is shown for the current selection. The server always recomputes the
// price at order time — this is a preview.
function WeightPicker({ p, inCart, t, onSet }) {
  const [custom, setCustom] = useState('');
  const active = (inCart && Number(inCart.weight_grams)) || 0;
  return (
    <div className="cpwa-weight">
      <div className="cpwa-weight-chips" role="group" aria-label={t('loose.weight')}>
        {WEIGHT_CHIPS.map((g) => (
          <button
            key={g}
            type="button"
            className={`cpwa-chip${active === g ? ' active' : ''}`}
            onClick={() => onSet(g)}
          >
            {gramsLabel(g)}
          </button>
        ))}
      </div>
      <div className="cpwa-weight-custom">
        <input
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder={t('loose.grams')}
          aria-label={t('loose.custom')}
        />
        <button
          type="button"
          className="secondary"
          disabled={!(Number(custom) > 0)}
          onClick={() => { onSet(Number(custom)); setCustom(''); }}
        >
          {t('common.add')}
        </button>
      </div>
      {active > 0 && (
        <div className="cpwa-weight-line">
          <span className="muted">{gramsLabel(active)}</span>
          <strong>{money(lineTotalPaise(inCart))}</strong>
          <button
            type="button"
            className="secondary cpwa-weight-remove"
            onClick={() => onSet(0)}
            aria-label={t('common.remove')}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

// One card for a multi-variant group. Holds the brand + size selection; resolves
// the chosen (brand, pack) back to its concrete product row so the price, the
// thumbnail and the Add/stepper all act on a real product id — identical to a
// single product card from the cart's point of view.
function VariantCard({ unit, cart, t, renderAction }) {
  const variants = unit.variants;

  // Distinct brands / packs kept in first-seen (stable) order. Null brand/pack
  // collapse to '' so a group with a single implicit brand or size shows no row.
  const brands = useMemo(() => {
    const seen = [];
    for (const v of variants) {
      const b = v.brand ?? '';
      if (!seen.includes(b)) seen.push(b);
    }
    return seen;
  }, [variants]);

  const packsFor = (brand) => {
    const seen = [];
    for (const v of variants) {
      if ((v.brand ?? '') === brand) {
        const pk = v.pack ?? '';
        if (!seen.includes(pk)) seen.push(pk);
      }
    }
    return seen;
  };

  const [brand, setBrand] = useState(brands[0] ?? '');
  const [pack, setPack] = useState(() => packsFor(brands[0] ?? '')[0] ?? '');

  // Keep selection valid if the product list changes underneath us.
  const safeBrand = brands.includes(brand) ? brand : (brands[0] ?? '');
  const packs = packsFor(safeBrand);
  const safePack = packs.includes(pack) ? pack : (packs[0] ?? '');

  function chooseBrand(b) {
    setBrand(b);
    // If the newly selected brand doesn't carry the current size, fall back to
    // that brand's first available size.
    const ps = packsFor(b);
    if (!ps.includes(pack)) setPack(ps[0] ?? '');
  }

  const resolved =
    variants.find((v) => (v.brand ?? '') === safeBrand && (v.pack ?? '') === safePack) || variants[0];
  const inCart = cart?.items?.[resolved.id];

  const subtitle = [safeBrand, safePack].filter(Boolean).join(' · ');

  return (
    <div className="card cpwa-vcard">
      <div className="cpwa-product cpwa-vcard-top">
        <ProductThumb product={resolved} />
        <div className="cpwa-product-info">
          <div className="cpwa-product-name">{unit.base}</div>
          {subtitle && <div className="muted cpwa-vcard-sub">{subtitle}</div>}
          <div className="cpwa-product-price">
            {money(resolved.price)} <span className="muted">/ {resolved.unit || t('c.unit')}</span>
          </div>
        </div>
        {renderAction(resolved, inCart)}
      </div>

      {brands.length > 1 && (
        <div className="cpwa-variant-row">
          <span className="cpwa-variant-label">{t('c.brand')}</span>
          <div className="cpwa-chips" role="group" aria-label={t('c.brand')}>
            {brands.map((b) => (
              <button
                key={b}
                type="button"
                className={`cpwa-chip ${b === safeBrand ? 'active' : ''}`}
                onClick={() => chooseBrand(b)}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
      )}

      {packs.length > 1 && (
        <div className="cpwa-variant-row">
          <span className="cpwa-variant-label">{t('c.size')}</span>
          <div className="cpwa-chips" role="group" aria-label={t('c.size')}>
            {packs.map((pk) => (
              <button
                key={pk}
                type="button"
                className={`cpwa-chip ${pk === safePack ? 'active' : ''}`}
                onClick={() => setPack(pk)}
              >
                {pk}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
