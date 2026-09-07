import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { colors, sizes } from '../theme';
import { Card, Field, Button, ErrorBanner, Empty } from '../components';
import { money } from '../money';
import { publicApi, my } from '../consumerApi';
import { useCart, lineTotalPaise } from '../CartContext';
import { useT } from '../i18n';

function gramsLabel(g) {
  const n = Number(g) || 0;
  return n % 1000 === 0 ? `${n / 1000} kg` : `${n} g`;
}

// Priority 4 — review the in-memory cart and place the order via POST /my/orders.
// Mirrors c/cart.js: pickup/delivery + credit/prepaid/cash, address required for
// delivery. Delivery-fee preview mirrors the server (free above threshold, else
// flat fee). prepaid returns a pay_link -> open PayWebView.
export default function CartScreen({ navigation }) {
  const { t } = useT();
  const cart = useCart();
  const [shop, setShop] = useState(null);
  const [fulfillment, setFulfillment] = useState('pickup');
  const [payment, setPayment] = useState('credit');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [placing, setPlacing] = useState(false);

  const activeShopId = cart.cart && cart.cart.shop_id;
  const shopName = cart.cart && cart.cart.shop_name;

  // Fetch the shop's fulfillment settings for the fee preview + which modes to
  // offer. If it fails (offline / unlisted) fall back to both, no fee — the
  // server stays authoritative at submit.
  useEffect(() => {
    if (!activeShopId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const r = await publicApi.shop(activeShopId);
        if (!cancelled) setShop(r.shop || r);
      } catch (e) {
        if (!cancelled) setShop(null);
      }
    })();
    return () => { cancelled = true; };
  }, [activeShopId]);

  let offersPickup = true;
  let offersDelivery = true;
  if (shop && (shop.offers_pickup || shop.offers_delivery)) {
    offersPickup = !!shop.offers_pickup;
    offersDelivery = !!shop.offers_delivery;
  }
  useEffect(() => {
    if (!offersDelivery && fulfillment === 'delivery') setFulfillment('pickup');
    else if (!offersPickup && fulfillment === 'pickup') setFulfillment('delivery');
  }, [offersPickup, offersDelivery]); // eslint-disable-line react-hooks/exhaustive-deps

  const subtotal = cart.subtotal;
  const deliveryFeeBase = Number(shop?.delivery_fee || 0);
  const freeMin = shop && shop.free_delivery_min != null ? Number(shop.free_delivery_min) : null;
  const minOrder = Number(shop?.delivery_min_order || 0);
  const isDelivery = fulfillment === 'delivery';
  const isFree = freeMin != null && subtotal >= freeMin;
  const fee = isDelivery ? (isFree ? 0 : deliveryFeeBase) : 0;
  const total = subtotal + fee;
  const belowMin = isDelivery && minOrder > 0 && subtotal < minOrder;

  if (!cart.cart || cart.count === 0) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Empty icon="🛒" text={t('cart.empty')}>
          <Button title={t('cart.browse')} onPress={() => navigation.navigate('ShopsList')} />
        </Empty>
      </ScrollView>
    );
  }

  async function placeOrder() {
    setError('');
    if (belowMin) return;
    if (isDelivery && !address.trim()) { setError(t('cart.addressRequired')); return; }
    setPlacing(true);
    try {
      const items = cart.lines.map((l) => (l.sold_by_weight
        ? { product_id: l.product_id, weight_grams: Number(l.weight_grams) }
        : { product_id: l.product_id, quantity: Number(l.quantity) }));
      const body = {
        shop_id: activeShopId,
        items,
        fulfillment_type: fulfillment,
        payment_mode: payment,
        address: isDelivery ? address.trim() : '',
        note: note.trim(),
      };
      const r = await my.createOrder(body);
      const order = r.order || r;
      const payLink = r.pay_link || r.link || r.payment_link;
      cart.clear();
      if (payment === 'prepaid' && payLink) {
        navigation.replace('PayWebView', { url: payLink, shopName });
        return;
      }
      const orderId = order?.id || r.order_id;
      if (orderId) {
        navigation.navigate('OrdersTab', { screen: 'OrderDetail', params: { orderId, shopName } });
      } else {
        navigation.navigate('OrdersTab', { screen: 'OrdersList' });
      }
    } catch (err) {
      setError(err.message);
      setPlacing(false);
    }
  }

  const Seg = ({ value, current, onPress, label, disabled }) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.seg, current === value && styles.segActive, disabled && styles.segDisabled]}
    >
      <Text style={[styles.segText, current === value && styles.segTextActive]}>{label}</Text>
    </Pressable>
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {shopName ? <Card><Text style={styles.shopName}>{shopName}</Text></Card> : null}

        <Card>
          {cart.lines.map((l) => (
            <View key={l.product_id} style={styles.line}>
              <View style={styles.lineInfo}>
                <Text style={styles.lineName}>{l.name}</Text>
                <Text style={styles.lineSub}>
                  {l.sold_by_weight
                    ? `${money(l.price)} ${t('shopdetail.perKg')} · ${gramsLabel(l.weight_grams)}`
                    : `${money(l.price)} × ${l.quantity}`}
                </Text>
              </View>
              {l.sold_by_weight ? (
                <Pressable onPress={() => cart.setQty(l.product_id, 0)} style={styles.removeBtn}>
                  <Text style={styles.removeText}>✕</Text>
                </Pressable>
              ) : (
                <View style={styles.stepper}>
                  <Pressable onPress={() => cart.setQty(l.product_id, l.quantity - 1)} style={styles.stepBtn}>
                    <Text style={styles.stepText}>−</Text>
                  </Pressable>
                  <Text style={styles.qty}>{l.quantity}</Text>
                  <Pressable onPress={() => cart.setQty(l.product_id, l.quantity + 1)} style={styles.stepBtn}>
                    <Text style={styles.stepText}>+</Text>
                  </Pressable>
                </View>
              )}
              <Text style={styles.lineTotal}>{money(lineTotalPaise(l))}</Text>
            </View>
          ))}
          <View style={styles.totRow}>
            <Text style={styles.totLabel}>{t('common.subtotal')}</Text>
            <Text style={styles.totVal}>{money(subtotal)}</Text>
          </View>
          {isDelivery && offersDelivery ? (
            <View style={styles.totRow}>
              <Text style={styles.totLabel}>{t('cart.deliveryFee')}</Text>
              <Text style={styles.totVal}>{isFree ? t('cart.freeDelivery') : money(fee)}</Text>
            </View>
          ) : null}
          <View style={[styles.totRow, styles.grandRow]}>
            <Text style={styles.grandLabel}>{t('common.total')}</Text>
            <Text style={styles.grandVal}>{money(total)}</Text>
          </View>
        </Card>

        <Card>
          <Text style={styles.label}>{t('cart.fulfillment')}</Text>
          <View style={styles.segRow}>
            {offersPickup ? <Seg value="pickup" current={fulfillment} onPress={() => setFulfillment('pickup')} label={t('cart.pickup')} /> : null}
            {offersDelivery ? <Seg value="delivery" current={fulfillment} onPress={() => setFulfillment('delivery')} label={t('cart.delivery')} /> : null}
          </View>
          {belowMin ? <Text style={styles.warn}>{money(minOrder)}</Text> : null}
          {isDelivery ? (
            <View style={styles.addrWrap}>
              <Field
                label={t('cart.address')}
                value={address}
                onChangeText={setAddress}
                placeholder={t('cart.addressPlaceholder')}
                multiline
              />
            </View>
          ) : null}
        </Card>

        <Card>
          <Text style={styles.label}>{t('cart.payment')}</Text>
          <View style={styles.segRow}>
            <Seg value="credit" current={payment} onPress={() => setPayment('credit')} label={t('cart.onKhata')} />
            <Seg value="prepaid" current={payment} onPress={() => setPayment('prepaid')} label={t('cart.payOnline')} />
            <Seg value="cash" current={payment} onPress={() => setPayment('cash')} label={t('cart.payCash')} />
          </View>
          <Text style={styles.payHint}>
            {payment === 'credit' ? t('cart.creditNote') : payment === 'cash' ? t('cart.cashNote') : t('cart.prepaidNote')}
          </Text>
        </Card>

        <Card>
          <Field
            label={t('cart.note')}
            value={note}
            onChangeText={setNote}
            placeholder={t('cart.notePlaceholder')}
          />
        </Card>

        <ErrorBanner>{error}</ErrorBanner>

        <Button
          title={placing ? t('cart.placing') : `${t('cart.placeOrder')} · ${money(total)}`}
          onPress={placeOrder}
          loading={placing}
          disabled={belowMin}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: sizes.pad, paddingBottom: 40 },
  shopName: { color: colors.text, fontSize: 18, fontWeight: '800' },
  line: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 8,
  },
  lineInfo: { flex: 1 },
  lineName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  lineSub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  lineTotal: { color: colors.text, fontSize: 15, fontWeight: '700', minWidth: 70, textAlign: 'right' },
  removeBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  removeText: { color: colors.text, fontSize: 16 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.text, fontSize: 20, fontWeight: '800' },
  qty: { color: colors.text, fontSize: 16, fontWeight: '800', minWidth: 26, textAlign: 'center' },
  totRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  totLabel: { color: colors.textMuted, fontSize: 15 },
  totVal: { color: colors.text, fontSize: 15, fontWeight: '600' },
  grandRow: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  grandLabel: { color: colors.text, fontSize: 18, fontWeight: '800' },
  grandVal: { color: colors.text, fontSize: 18, fontWeight: '800' },
  label: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 10 },
  segRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  seg: {
    flexGrow: 1, minHeight: 48, borderRadius: sizes.radius, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14,
  },
  segActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  segDisabled: { opacity: 0.4 },
  segText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  segTextActive: { color: colors.onAccent },
  addrWrap: { marginTop: 14 },
  payHint: { color: colors.textMuted, fontSize: 13, marginTop: 10 },
  warn: { color: colors.warn, fontSize: 14, marginTop: 10 },
});
