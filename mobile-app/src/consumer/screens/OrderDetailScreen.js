import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, sizes } from '../theme';
import { Card, Button, ErrorBanner, Loading, Badge } from '../components';
import { money } from '../money';
import { my } from '../consumerApi';
import { useT } from '../i18n';

// The per-fulfillment status pipeline (pickup omits out_for_delivery), used to
// draw a simple stepper. Reached stages are derived by rank from the status.
const PICKUP_STEPS = ['pending', 'accepted', 'preparing', 'ready', 'completed'];
const DELIVERY_STEPS = ['pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'completed'];

// Priority 5 — order detail from GET /my/orders/:id, with a status stepper and
// a cancel action while the order is still pending (POST /my/orders/:id/cancel).
export default function OrderDetailScreen({ route }) {
  const { t } = useT();
  const { orderId } = route.params;
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await my.order(orderId);
      setOrder(r.order || r);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function confirmCancel() {
    Alert.alert(t('orderdetail.title'), t('orderdetail.cancelConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('orderdetail.cancel'), style: 'destructive', onPress: cancel },
    ]);
  }

  async function cancel() {
    setCancelling(true);
    setError('');
    try {
      const r = await my.cancelOrder(orderId);
      setOrder(r.order || r);
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  }

  const isCancelled = order && order.status === 'cancelled';
  const cancellable = order && order.status === 'pending';
  const steps = order && order.fulfillment_type === 'delivery' ? DELIVERY_STEPS : PICKUP_STEPS;
  const currentIdx = order ? steps.indexOf(order.status) : -1;

  function payLabel(o) {
    if (!o) return '';
    if (o.payment_status === 'paid') return t('pstatus.paid');
    return t(`pmode.${o.payment_mode}`);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ErrorBanner>{error}</ErrorBanner>
      {loading && !order ? (
        <Loading text={t('orderdetail.loading')} />
      ) : order ? (
        <>
          <Card>
            <View style={styles.head}>
              <Text style={styles.shop}>{order.shop_name}</Text>
              <Badge tone={isCancelled ? 'danger' : order.status === 'completed' ? 'ok' : 'warn'}>
                {t(`ostatus.${order.status}`)}
              </Badge>
            </View>
            <Text style={styles.date}>{new Date(order.created_at).toLocaleString()}</Text>
            <View style={styles.badges}>
              <Badge>{order.fulfillment_type === 'delivery' ? t('cart.delivery') : t('cart.pickup')}</Badge>
              <Badge tone={order.payment_status === 'paid' ? 'ok' : undefined}>
                {t('orderdetail.payment')} {payLabel(order)}
              </Badge>
            </View>
            {order.address ? <Text style={styles.meta}>{t('orderdetail.deliverTo')} {order.address}</Text> : null}
            {order.note ? <Text style={styles.meta}>{t('orderdetail.note')} {order.note}</Text> : null}
          </Card>

          <Card>
            <Text style={styles.sectTitle}>{t('common.status')}</Text>
            {isCancelled ? (
              <View style={styles.step}>
                <View style={[styles.dot, styles.dotCancelled]} />
                <Text style={styles.stepText}>{t('ostatus.cancelled')}</Text>
              </View>
            ) : (
              steps.map((s, i) => (
                <View key={s} style={styles.step}>
                  <View style={[styles.dot, i <= currentIdx && styles.dotDone, i === currentIdx && styles.dotCurrent]} />
                  <Text style={[styles.stepText, i <= currentIdx && styles.stepTextDone]}>{t(`ostatus.${s}`)}</Text>
                </View>
              ))
            )}
          </Card>

          <Card>
            <Text style={styles.sectTitle}>{t('common.items')}</Text>
            {(order.items || []).map((it) => (
              <View key={it.id || it.product_id} style={styles.item}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{it.name}</Text>
                  <Text style={styles.itemSub}>{money(it.unit_price)} × {it.quantity}</Text>
                </View>
                <Text style={styles.itemTotal}>
                  {money(it.line_total != null ? it.line_total : it.unit_price * it.quantity)}
                </Text>
              </View>
            ))}
            <View style={styles.totRow}>
              <Text style={styles.totLabel}>{t('common.subtotal')}</Text>
              <Text style={styles.totVal}>{money(order.subtotal)}</Text>
            </View>
            {order.delivery_fee != null && order.fulfillment_type === 'delivery' ? (
              <View style={styles.totRow}>
                <Text style={styles.totLabel}>{t('orderdetail.deliveryFee')}</Text>
                <Text style={styles.totVal}>{Number(order.delivery_fee) === 0 ? t('cart.freeDelivery') : money(order.delivery_fee)}</Text>
              </View>
            ) : null}
            <View style={[styles.totRow, styles.grandRow]}>
              <Text style={styles.grandLabel}>{t('common.total')}</Text>
              <Text style={styles.grandVal}>{money(order.total != null ? order.total : order.subtotal)}</Text>
            </View>
          </Card>

          {cancellable ? (
            <Button
              title={cancelling ? t('orderdetail.cancelling') : t('orderdetail.cancel')}
              variant="danger"
              onPress={confirmCancel}
              loading={cancelling}
            />
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: sizes.pad },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shop: { color: colors.text, fontSize: 19, fontWeight: '800', flex: 1, paddingRight: 8 },
  date: { color: colors.textMuted, fontSize: 13, marginTop: 6 },
  badges: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  meta: { color: colors.textMuted, fontSize: 14, marginTop: 8 },
  sectTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  step: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.border, marginRight: 12 },
  dotDone: { backgroundColor: colors.accent },
  dotCurrent: { backgroundColor: colors.accent, transform: [{ scale: 1.3 }] },
  dotCancelled: { backgroundColor: colors.danger },
  stepText: { color: colors.textMuted, fontSize: 15 },
  stepTextDone: { color: colors.text, fontWeight: '600' },
  item: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  itemInfo: { flex: 1, paddingRight: 8 },
  itemName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  itemSub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  itemTotal: { color: colors.text, fontSize: 15, fontWeight: '700' },
  totRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  totLabel: { color: colors.textMuted, fontSize: 15 },
  totVal: { color: colors.text, fontSize: 15, fontWeight: '600' },
  grandRow: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  grandLabel: { color: colors.text, fontSize: 18, fontWeight: '800' },
  grandVal: { color: colors.text, fontSize: 18, fontWeight: '800' },
});
