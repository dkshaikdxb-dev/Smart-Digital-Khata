import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, StyleSheet,
} from 'react-native';
import { colors, sizes } from '../theme';
import { Card, Loading, Empty, Button } from '../components';
import ShopCarousel from '../components/ShopCarousel';
import ProductThumb from '../components/ProductThumb';
import { money } from '../money';
import { publicApi } from '../consumerApi';
import { friendlyError, canRetry } from '../lib/errorText';
import {
  groupVariants, filterUnits, categoriesOf, normalizeSelection, resolveVariant,
} from '../lib/variantGroups';
import { useCart, lineTotalPaise } from '../CartContext';
import { useT } from '../i18n';
import { availabilityLine, isOpen } from '../../lib/shopOpen';

// Quick-pick weight chips for loose/weighed items (grams).
const WEIGHT_CHIPS = [250, 500, 1000];
function gramsLabel(g) {
  const n = Number(g) || 0;
  return n % 1000 === 0 ? `${n / 1000} kg` : `${n} g`;
}

// Priority 3 — shop profile + catalog from GET /public/shops/:id (localized by
// the app's selected language).
//
// VARIANT GROUPING (this batch). The storefront payload has always carried
// `base_product`, `brand` and `pack`, and the web has always folded rows that
// share a base product into ONE card with brand and size chips. The native app
// did not, so four brands of Sona Masuri in three pack sizes came down as twelve
// separate rows — harder to shop and, worse for the shopkeeper, it makes a
// modest catalogue look padded with near-duplicates. The folding itself lives in
// lib/variantGroups.js; each (brand, pack) is still its own product row with its
// own id and its own integer-paise price, so the cart and checkout are untouched.
//
// SEARCH + CATEGORY CHIPS come with it, for the same reason they exist on the
// web: once a shop has a few hundred rows, scrolling is not browsing. Both filter
// the ALREADY-LOADED list on the device — no extra request, nothing to pay for
// on 2G — and search matches the API's all-language `search_text` blob, so
// "chawal" finds the row named "Rice".
export default function ShopDetailScreen({ route, navigation }) {
  const { t, lang } = useT();
  const { shopId, shopName } = route.params;
  const cart = useCart();
  const [shop, setShop] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryable, setRetryable] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState(''); // '' = every category
  // Whether a load has ever COMPLETED, so an empty catalogue is only ever
  // reported once we actually know the catalogue is empty.
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setError('');
    setRetryable(false);
    setLoading(true);
    try {
      const r = await publicApi.shop(shopId, lang);
      const s = r.shop || r;
      setShop(s);
      setProducts(s.products || r.products || []);
      setLoaded(true);
    } catch (err) {
      // An authored sentence, never the axios/server text.
      setError(friendlyError(t, err));
      setRetryable(canRetry(err));
    } finally {
      setLoading(false);
    }
  }, [shopId, lang, t]);

  useEffect(() => { load(); }, [load]);

  const inCart = (id) => (cart.cart && cart.cart.shop_id === shopId ? cart.cart.items[id] : null);
  const name = shop ? shop.name : shopName;

  const units = useMemo(() => groupVariants(products), [products]);
  const categories = useMemo(() => categoriesOf(products), [products]);
  const visibleUnits = useMemo(
    () => filterUnits(units, { search, category: activeCat }),
    [units, search, activeCat]
  );

  // Shop availability (batch A). `shop.availability` is the SAME object the
  // directory and both web surfaces render; nothing is recomputed here. While
  // the shop is shut the catalogue stays fully browsable and the Add controls
  // are DISABLED with the reason — never hidden, which would look broken.
  const shopOpen = isOpen(shop && shop.availability);
  const closedLine = shopOpen ? '' : availabilityLine(t, shop.availability, lang);

  function fulfillmentLine() {
    if (!shop) return null;
    if (shop.offers_delivery) {
      return `🛵 ${t('shopdetail.delivery')} ${money(shop.delivery_fee)}${shop.offers_pickup ? `  ·  🏬 ${t('shopdetail.pickup')}` : ''}`;
    }
    if (shop.offers_pickup) return `🏬 ${t('shopdetail.pickup')}`;
    return null;
  }

  // The add / stepper control for ONE resolved product, shared by plain rows and
  // by the resolved variant inside a group card.
  function renderAction(p) {
    const line = inCart(p.id);
    if (line) {
      return (
        <View style={styles.stepper}>
          <Pressable onPress={() => cart.setQty(p.id, line.quantity - 1)} style={styles.stepBtn}>
            <Text style={styles.stepText}>−</Text>
          </Pressable>
          <Text style={styles.qty}>{line.quantity}</Text>
          <Pressable
            onPress={() => cart.setQty(p.id, line.quantity + 1)}
            disabled={!shopOpen}
            style={[styles.stepBtn, !shopOpen && styles.disabled]}
          >
            <Text style={styles.stepText}>+</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <Pressable
        onPress={() => cart.addUnit(shopId, name, p)}
        disabled={!shopOpen}
        style={[styles.addBtn, !shopOpen && styles.addBtnClosed]}
      >
        <Text style={[styles.addText, !shopOpen && styles.addTextClosed]}>
          {shopOpen ? t('shopdetail.add') : t('open.cannotOrder')}
        </Text>
      </Pressable>
    );
  }

  // Weight chips for a loose/weighed product, shared the same way.
  function renderWeight(p) {
    const line = inCart(p.id);
    const activeG = line ? Number(line.weight_grams) : 0;
    return (
      <>
        <View style={styles.chips}>
          {WEIGHT_CHIPS.map((g) => (
            <Pressable
              key={g}
              onPress={() => cart.setWeight(shopId, name, p, activeG === g ? 0 : g)}
              disabled={!shopOpen}
              style={[styles.chip, activeG === g && styles.chipActive, !shopOpen && styles.disabled]}
            >
              <Text style={[styles.chipText, activeG === g && styles.chipTextActive]}>{gramsLabel(g)}</Text>
            </Pressable>
          ))}
        </View>
        {line ? (
          <Text style={styles.lineTotal}>{gramsLabel(activeG)} · {money(lineTotalPaise(line))}</Text>
        ) : null}
      </>
    );
  }

  function priceLine(p) {
    return p.sold_by_weight
      ? <Text style={styles.price}>{money(p.price)} <Text style={styles.per}>{t('shopdetail.perKg')}</Text></Text>
      : <Text style={styles.price}>{money(p.price)} <Text style={styles.per}>{t('shopdetail.per', { unit: p.unit || t('shopdetail.unit') })}</Text></Text>;
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} stickyHeaderIndices={shop ? [0] : undefined}>
        {shop ? (
          <View style={styles.shopHeader}>
            <Text style={styles.shopName} numberOfLines={1}>{name}</Text>
            <Text style={styles.loc} numberOfLines={1}>
              {[shop.area, shop.city].filter(Boolean).join(', ') || t('shops.noLocation')}
            </Text>
            {fulfillmentLine() ? <Text style={styles.ful}>{fulfillmentLine()}</Text> : null}
          </View>
        ) : null}

        {/* Shop availability (batch A): a banner at the very top of the
            storefront when the shop is shut, saying WHY and WHEN it reopens. */}
        {shop && !shopOpen ? (
          <View style={styles.closedBanner}>
            <Text style={styles.closedTitle}>{t('open.bannerTitle')}</Text>
            <Text style={styles.closedLine}>{closedLine}</Text>
            <Text style={styles.closedHint}>{t('open.browseOnly')}</Text>
          </View>
        ) : null}

        {/* Storefront photos (0-3), directly under the sticky header. Same
            horizontal padding as the header; nothing renders when empty. */}
        {shop ? <ShopCarousel slides={shop.slides} images={shop.images} alt={name} /> : null}

        {/* In-catalogue search + category chips. Only once there is a catalogue
            to filter — a search box over an empty or failed list is furniture. */}
        {shop && products.length > 0 ? (
          <Card>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t('shopdetail.searchProducts')}
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel={t('shopdetail.searchProducts')}
            />
            {categories.length > 0 ? (
              <View style={styles.chipsTop}>
                <Pressable
                  onPress={() => setActiveCat('')}
                  style={[styles.chip, activeCat === '' && styles.chipActive]}
                >
                  <Text style={[styles.chipText, activeCat === '' && styles.chipTextActive]}>
                    {t('shopdetail.allCategories')}
                  </Text>
                </Pressable>
                {categories.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setActiveCat(c)}
                    style={[styles.chip, activeCat === c && styles.chipActive]}
                  >
                    {/* The LABEL is the localized name the backend supplies for
                        non-English languages; the raw English `c` stays the
                        filter key, so filtering is language-independent. */}
                    <Text style={[styles.chipText, activeCat === c && styles.chipTextActive]}>
                      {(shop.category_labels || {})[c] || c}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* Failed, loading and empty are three different screens. A catalogue
            that failed to load used to fall through to "This shop has not added
            items yet" — telling a shopper a stocked shop is bare. */}
        {error ? (
          <View style={styles.errCard}>
            <Text style={styles.errIcon}>⚠️</Text>
            <Text style={styles.errTitle}>{t('shopdetail.failedTitle')}</Text>
            <Text style={styles.errText}>{error}</Text>
            {retryable ? <Button title={t('common.retry')} onPress={load} style={styles.errBtn} /> : null}
          </View>
        ) : loading ? (
          <Loading text={t('shopdetail.loading')} />
        ) : loaded && products.length === 0 ? (
          <Empty icon="📦" text={t('shopdetail.noItems')} />
        ) : visibleUnits.length === 0 ? (
          // A filtered-to-nothing catalogue is NOT an empty shop, and must not
          // borrow the empty-shop sentence.
          <Empty icon="🔍" text={t('shopdetail.noResults')} />
        ) : (
          visibleUnits.map((u) => {
            if (u.kind === 'group') {
              return (
                <VariantCard
                  key={u.key}
                  unit={u}
                  t={t}
                  renderAction={renderAction}
                  renderWeight={renderWeight}
                  priceLine={priceLine}
                />
              );
            }
            const p = u.product;
            if (p.sold_by_weight) {
              return (
                <Card key={u.key}>
                  <View style={styles.prodRow}>
                    <ProductThumb product={p} size={56} style={styles.thumb} />
                    <View style={styles.prodInfo}>
                      <Text style={styles.prodName} numberOfLines={2}>{p.name}</Text>
                      {p.description ? <Text style={styles.desc} numberOfLines={2}>{p.description}</Text> : null}
                      {priceLine(p)}
                    </View>
                  </View>
                  {renderWeight(p)}
                </Card>
              );
            }
            return (
              <Card key={u.key}>
                <View style={styles.prodRow}>
                  <ProductThumb product={p} size={56} style={styles.thumb} />
                  <View style={styles.prodInfo}>
                    <Text style={styles.prodName} numberOfLines={2}>{p.name}</Text>
                    {p.description ? <Text style={styles.desc} numberOfLines={2}>{p.description}</Text> : null}
                    {priceLine(p)}
                  </View>
                  {renderAction(p)}
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>

      {cart.cart && cart.cart.shop_id === shopId && cart.count > 0 ? (
        <View style={styles.cartBar}>
          <View>
            <Text style={styles.cartCount}>{t('shops.itemsCount', { n: cart.count })}</Text>
            <Text style={styles.cartTotal}>{money(cart.subtotal)}</Text>
          </View>
          {/* The cart is its own tab now, so reviewing an order leaves this
              stack instead of pushing a Cart screen that only existed here. */}
          <Button title={t('shopdetail.review')} onPress={() => navigation.navigate('CartTab')} style={styles.reviewBtn} />
        </View>
      ) : null}
    </View>
  );
}

// ONE card for a multi-variant group: the generic product name, a brand row and
// a size row, and the price/thumbnail/action of whichever concrete variant is
// selected. The selection lives here, so switching brand or size re-prices the
// card from the real product row rather than from anything computed.
//
// A row is rendered only when that axis has more than one choice — a group whose
// variants all share a brand shows sizes only, and no dead single chip.
function VariantCard({ unit, t, renderAction, renderWeight, priceLine }) {
  const [brand, setBrand] = useState('');
  const [pack, setPack] = useState('');
  // Selections are normalized against the CURRENT variant list on every render,
  // so a catalogue that reloads under the card (a language switch does exactly
  // that) can never leave it pointing at a brand or size that no longer exists.
  const sel = normalizeSelection(unit.variants, brand, pack);
  const resolved = resolveVariant(unit.variants, sel.brand, sel.pack);
  if (!resolved) return null;

  function chooseBrand(b) {
    setBrand(b);
    // If the new brand does not carry the size in hand, drop to its first size
    // rather than silently resolving to a product the shopper did not pick.
    const next = normalizeSelection(unit.variants, b, pack);
    setPack(next.pack);
  }

  const subtitle = [sel.brand, sel.pack].filter(Boolean).join(' · ');

  return (
    <Card>
      <View style={styles.prodRow}>
        <ProductThumb product={resolved} size={56} style={styles.thumb} />
        <View style={styles.prodInfo}>
          <Text style={styles.prodName} numberOfLines={2}>{unit.base}</Text>
          {subtitle ? <Text style={styles.desc} numberOfLines={1}>{subtitle}</Text> : null}
          {priceLine(resolved)}
        </View>
        {resolved.sold_by_weight ? null : renderAction(resolved)}
      </View>

      {sel.brands.length > 1 ? (
        <View style={styles.axis}>
          <Text style={styles.axisLabel}>{t('shopdetail.brand')}</Text>
          <View style={styles.chips}>
            {sel.brands.map((b) => (
              <Pressable
                key={b || '_'}
                onPress={() => chooseBrand(b)}
                style={[styles.chip, b === sel.brand && styles.chipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: b === sel.brand }}
              >
                <Text style={[styles.chipText, b === sel.brand && styles.chipTextActive]}>{b}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {sel.packs.length > 1 ? (
        <View style={styles.axis}>
          <Text style={styles.axisLabel}>{t('shopdetail.size')}</Text>
          <View style={styles.chips}>
            {sel.packs.map((pk) => (
              <Pressable
                key={pk || '_'}
                onPress={() => setPack(pk)}
                style={[styles.chip, pk === sel.pack && styles.chipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: pk === sel.pack }}
              >
                <Text style={[styles.chipText, pk === sel.pack && styles.chipTextActive]}>{pk}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {/* A weighed variant inside a group keeps its weight chips rather than a
          unit stepper — the cart line for a loose item is a weight, not a count,
          and adding it as "1" would put the wrong thing in the basket. */}
      {resolved.sold_by_weight ? renderWeight(resolved) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: sizes.pad, paddingBottom: 90 },
  shopHeader: {
    backgroundColor: colors.card,
    borderRadius: sizes.radius,
    padding: sizes.pad,
    marginBottom: sizes.gap,
  },
  shopName: { color: colors.text, fontSize: 20, fontWeight: '800' },
  loc: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  ful: { color: colors.text, fontSize: 14, marginTop: 8 },
  searchInput: {
    backgroundColor: colors.cardAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: sizes.radius,
    color: colors.text,
    fontSize: 17,
    paddingHorizontal: 14,
    minHeight: sizes.tap,
  },
  closedBanner: {
    backgroundColor: colors.card,
    borderRadius: sizes.radius,
    borderLeftWidth: 5,
    borderLeftColor: colors.warn || '#f59e0b',
    padding: sizes.pad,
    marginBottom: sizes.gap,
  },
  closedTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  closedLine: { color: colors.text, fontSize: 14, marginTop: 6 },
  closedHint: { color: colors.textMuted, fontSize: 13, marginTop: 6 },
  // INERT, NOT GHOSTED.
  //
  // A disabled control used to be the live green button at 45% opacity. Two
  // things were wrong with that on a cheap phone in daylight: the colour still
  // said "go", and the label — which on a shut shop carries the REASON — faded
  // with it. So the closed state swaps the FILL to a neutral and keeps the text
  // at full contrast. Nothing is hidden; it simply stops looking tappable.
  disabled: { backgroundColor: colors.border, borderColor: colors.border, opacity: 0.9 },
  addBtnClosed: { backgroundColor: colors.border },
  addTextClosed: { color: colors.text },
  prodRow: { flexDirection: 'row', alignItems: 'center' },
  thumb: { marginRight: 12 },
  errCard: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: sizes.radius,
    padding: sizes.pad,
    alignItems: 'center',
    marginBottom: sizes.gap,
  },
  errIcon: { fontSize: 34, marginBottom: 8 },
  errTitle: { color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  errText: { color: '#fecaca', fontSize: 15, textAlign: 'center', marginTop: 6 },
  errBtn: { marginTop: 14, alignSelf: 'stretch' },
  prodInfo: { flex: 1, paddingRight: 12 },
  prodName: { color: colors.text, fontSize: 17, fontWeight: '700' },
  desc: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  price: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 6 },
  per: { color: colors.textMuted, fontSize: 13, fontWeight: '400' },
  addBtn: {
    backgroundColor: colors.accent,
    minHeight: 44,
    borderRadius: sizes.radius,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: { color: colors.onAccent, fontWeight: '800', fontSize: 15 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // Changing a quantity changes what the shopper pays, so it gets a real
  // target: 44px minimum, against the app's own 52px token.
  stepBtn: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepText: { color: colors.text, fontSize: 22, fontWeight: '800' },
  qty: { color: colors.text, fontSize: 18, fontWeight: '800', minWidth: 32, textAlign: 'center' },
  chips: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  chipsTop: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  axis: { marginTop: 4 },
  axisLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '600', marginTop: 10 },
  chip: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 999,
    paddingHorizontal: 18, minHeight: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  chipTextActive: { color: colors.onAccent },
  lineTotal: { color: colors.positive, fontSize: 15, fontWeight: '700', marginTop: 10 },
  cartBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.card, padding: sizes.pad,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  cartCount: { color: colors.textMuted, fontSize: 13 },
  cartTotal: { color: colors.text, fontSize: 20, fontWeight: '800' },
  reviewBtn: { paddingHorizontal: 24 },
});
