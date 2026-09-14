import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, sizes } from '../theme';
import { Loading, Empty, Badge, Button } from '../components';
import { money } from '../money';
import { my } from '../consumerApi';
import { friendlyError, canRetry } from '../lib/errorText';
import { useT } from '../i18n';
import { etaState, formatClock } from '../../lib/orderEta';

// Priority 5 — the customer's orders from GET /my/orders -> { items:[...] }.
function statusTone(status) {
  if (status === 'cancelled') return 'danger';
  if (status === 'completed') return 'ok';
  return 'warn';
}

// The ONE thing the shopper is waiting for at this status, in their words.
// Mirrors the web's orderStatus.waitingHintKey exactly, including the split at
// `ready`: a pickup order is ready for THEM to collect, a delivery order is
// ready and waiting to go out — different actions, so different sentences.
// Until now the native list showed only a status chip ("Preparing"), which
// names a state without saying what happens next or who is doing it.
// The statuses a sentence exists for. An unrecognised one (a pipeline the app
// has not been updated for yet) renders NOTHING rather than the bare key text
// — "ostatus.hint.foo" on a shopper's order list would be worse than silence.
const HINTED = new Set([
  'pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled',
]);

function waitingHintKey(order) {
  const status = order && order.status;
  if (!HINTED.has(status)) return '';
  if (status === 'ready') {
    return order.fulfillment_type === 'pickup'
      ? 'ostatus.hint.ready_pickup'
      : 'ostatus.hint.ready_delivery';
  }
  return `ostatus.hint.${status}`;
}

// Pickup / delivery, from strings already authored in all ten languages.
function fulfillmentLabel(t, order) {
  const f = order && order.fulfillment_type;
  if (f === 'pickup') return t('cart.pickup');
  if (f === 'delivery') return t('cart.delivery');
  return '';
}

export default function OrdersScreen({ navigation }) {
  const { t, lang } = useT();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [retryable, setRetryable] = useState(false);
  // Whether a load has ever COMPLETED. An empty list before that is "still
  // arriving", not "you have never ordered anything".
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setError('');
    setRetryable(false);
    try {
      const r = await my.orders();
      setItems(r.items || r.orders || []);
      setLoaded(true);
    } catch (err) {
      // Authored sentence, never the raw axios/server text.
      setError(friendlyError(t, err));
      setRetryable(canRetry(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
    >
      {/* Failed, loading and empty are three different screens. A failed load
          used to render the empty illustration under a thin banner — telling a
          shopper waiting on an order that they have no orders. */}
      {error ? (
        <View style={styles.errCard}>
          <Text style={styles.errIcon}>⚠️</Text>
          <Text style={styles.errTitle}>{t('orders.failedTitle')}</Text>
          <Text style={styles.errText}>{error}</Text>
          {retryable ? <Button title={t('common.retry')} onPress={load} style={styles.errBtn} /> : null}
        </View>
      ) : loading ? (
        <Loading text={t('orders.loading')} />
      ) : loaded && items.length === 0 ? (
        <Empty icon="📦" text={t('orders.none')} />
      ) : (
        items.map((o) => (
          <Pressable
            key={o.id}
            onPress={() => navigation.navigate('OrderDetail', { orderId: o.id, shopName: o.shop_name })}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.head}>
              <Text style={styles.shop}>{o.shop_name || t('orders.title')}</Text>
              <Badge tone={statusTone(o.status)}>{t(`ostatus.${o.status}`)}</Badge>
            </View>
            {/* What happens next, not just what state it is in. */}
            {waitingHintKey(o) ? <Text style={styles.next}>{t(waitingHintKey(o))}</Text> : null}
            <Text style={styles.date}>
              {new Date(o.created_at).toLocaleString()}
              {o.item_count != null ? ` · ${t('orders.itemsCount', { n: o.item_count })}` : ''}
            </Text>
            {/* The shop's ready-time promise (batch B). Shown prominently while
                the order is still being worked on; once the promised time has
                passed we say "taking a little longer" and NOT "late" — the
                shopkeeper is a neighbour who is busy, not a courier breaching an
                SLA. Nothing is shown when no promise was made. */}
            {etaState(o) === 'promised' ? (
              <Text style={styles.eta}>{t('eta.readyBy', { time: formatClock(o.promised_at, lang) })}</Text>
            ) : null}
            {etaState(o) === 'late' ? (
              <Text style={styles.etaSoft}>{t('eta.takingLonger')}</Text>
            ) : null}
            <View style={styles.meta}>
              <Text style={styles.total}>{money(o.total != null ? o.total : o.subtotal)}</Text>
              {/* Whether this one is being collected or delivered — the web has
                  carried this badge all along and the app did not, so a shopper
                  with both kinds open could not tell them apart in the list. */}
              {fulfillmentLabel(t, o) ? <Badge>{fulfillmentLabel(t, o)}</Badge> : null}
              <Badge>{t(`pmode.${o.payment_mode}`)}</Badge>
            </View>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: sizes.pad },
  row: {
    backgroundColor: colors.card, borderRadius: sizes.radius,
    padding: sizes.pad, marginBottom: sizes.gap,
  },
  pressed: { opacity: 0.85 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shop: { color: colors.text, fontSize: 17, fontWeight: '700', flex: 1, paddingRight: 8 },
  next: { color: colors.text, fontSize: 15, marginTop: 8 },
  date: { color: colors.textMuted, fontSize: 13, marginTop: 6 },
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
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  total: { color: colors.text, fontSize: 16, fontWeight: '800' },
  eta: { color: colors.accent, fontSize: 15, fontWeight: '700', marginTop: 6 },
  etaSoft: { color: colors.textMuted, fontSize: 15, fontWeight: '600', marginTop: 6 },
});
