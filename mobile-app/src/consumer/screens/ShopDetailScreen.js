import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
} from 'react-native';
import { colors, sizes } from '../theme';
import { Card, ErrorBanner, Loading, Empty, Button } from '../components';
import { money } from '../money';
import { publicApi } from '../consumerApi';
import { useCart, lineTotalPaise } from '../CartContext';
import { useT } from '../i18n';

// Quick-pick weight chips for loose/weighed items (grams).
const WEIGHT_CHIPS = [250, 500, 1000];
function gramsLabel(g) {
  const n = Number(g) || 0;
  return n % 1000 === 0 ? `${n / 1000} kg` : `${n} g`;
}

// Priority 3 — shop profile + catalog from GET /public/shops/:id. Items add to
// the in-memory cart; a bottom bar leads to the cart. Product rows mirror
// c/shop/[shopId].js (unit items get a stepper; sold_by_weight items get weight
// chips), without the web's variant-grouping (each product row stands alone).
export default function ShopDetailScreen({ route, navigation }) {
  const { t } = useT();
  const { shopId, shopName } = route.params;
  const cart = useCart();
  const [shop, setShop] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await publicApi.shop(shopId);
      const s = r.shop || r;
      setShop(s);
      setProducts(s.products || r.products || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => { load(); }, [load]);

  const inCart = (id) => cart.cart && cart.cart.shop_id === shopId ? cart.cart.items[id] : null;
  const name = shop ? shop.name : shopName;

  function fulfillmentLine() {
    if (!shop) return null;
    if (shop.offers_delivery) {
      return `🛵 ${t('shopdetail.delivery')} ${money(shop.delivery_fee)}${shop.offers_pickup ? `  ·  🏬 ${t('shopdetail.pickup')}` : ''}`;
    }
    if (shop.offers_pickup) return `🏬 ${t('shopdetail.pickup')}`;
    return null;
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ErrorBanner>{error}</ErrorBanner>

        {loading ? (
          <Loading text={t('shopdetail.loading')} />
        ) : (
          <>
            {shop ? (
              <Card>
                <Text style={styles.shopName}>{name}</Text>
                <Text style={styles.loc}>
                  {[shop.area, shop.city].filter(Boolean).join(', ') || t('shops.noLocation')}
                </Text>
                {fulfillmentLine() ? <Text style={styles.ful}>{fulfillmentLine()}</Text> : null}
              </Card>
            ) : null}

            {products.length === 0 ? (
              <Empty icon="📦" text={t('shopdetail.noItems')} />
            ) : (
              products.map((p) => {
                const line = inCart(p.id);
                if (p.sold_by_weight) {
                  const activeG = line ? Number(line.weight_grams) : 0;
                  return (
                    <Card key={p.id}>
                      <View style={styles.prodTop}>
                        <View style={styles.prodInfo}>
                          <Text style={styles.prodName}>{p.name}</Text>
                          {p.description ? <Text style={styles.desc} numberOfLines={2}>{p.description}</Text> : null}
                          <Text style={styles.price}>{money(p.price)} <Text style={styles.per}>{t('shopdetail.perKg')}</Text></Text>
                        </View>
                      </View>
                      <View style={styles.chips}>
                        {WEIGHT_CHIPS.map((g) => (
                          <Pressable
                            key={g}
                            onPress={() => cart.setWeight(shopId, name, p, activeG === g ? 0 : g)}
                            style={[styles.chip, activeG === g && styles.chipActive]}
                          >
                            <Text style={[styles.chipText, activeG === g && styles.chipTextActive]}>{gramsLabel(g)}</Text>
                          </Pressable>
                        ))}
                      </View>
                      {line ? (
                        <Text style={styles.lineTotal}>{gramsLabel(activeG)} · {money(lineTotalPaise(line))}</Text>
                      ) : null}
                    </Card>
                  );
                }
                return (
                  <Card key={p.id}>
                    <View style={styles.prodTop}>
                      <View style={styles.prodInfo}>
                        <Text style={styles.prodName}>{p.name}</Text>
                        {p.description ? <Text style={styles.desc} numberOfLines={2}>{p.description}</Text> : null}
                        <Text style={styles.price}>{money(p.price)} <Text style={styles.per}>{t('shopdetail.per', { unit: p.unit || t('shopdetail.unit') })}</Text></Text>
                      </View>
                      {line ? (
                        <View style={styles.stepper}>
                          <Pressable onPress={() => cart.setQty(p.id, line.quantity - 1)} style={styles.stepBtn}>
                            <Text style={styles.stepText}>−</Text>
                          </Pressable>
                          <Text style={styles.qty}>{line.quantity}</Text>
                          <Pressable onPress={() => cart.setQty(p.id, line.quantity + 1)} style={styles.stepBtn}>
                            <Text style={styles.stepText}>+</Text>
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable onPress={() => cart.addUnit(shopId, name, p)} style={styles.addBtn}>
                          <Text style={styles.addText}>{t('shopdetail.add')}</Text>
                        </Pressable>
                      )}
                    </View>
                  </Card>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      {cart.cart && cart.cart.shop_id === shopId && cart.count > 0 ? (
        <View style={styles.cartBar}>
          <View>
            <Text style={styles.cartCount}>{t('shops.itemsCount', { n: cart.count })}</Text>
            <Text style={styles.cartTotal}>{money(cart.subtotal)}</Text>
          </View>
          <Button title={t('shopdetail.review')} onPress={() => navigation.navigate('Cart')} style={styles.reviewBtn} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: sizes.pad, paddingBottom: 90 },
  shopName: { color: colors.text, fontSize: 20, fontWeight: '800' },
  loc: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  ful: { color: colors.text, fontSize: 14, marginTop: 8 },
  prodTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepText: { color: colors.text, fontSize: 22, fontWeight: '800' },
  qty: { color: colors.text, fontSize: 18, fontWeight: '800', minWidth: 32, textAlign: 'center' },
  chips: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  chip: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 999,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  chipTextActive: { color: colors.onAccent },
  lineTotal: { color: colors.accent, fontSize: 15, fontWeight: '700', marginTop: 10 },
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
