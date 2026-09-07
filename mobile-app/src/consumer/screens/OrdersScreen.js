import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, sizes } from '../theme';
import { ErrorBanner, Loading, Empty, Badge } from '../components';
import { money } from '../money';
import { my } from '../consumerApi';
import { useT } from '../i18n';

// Priority 5 — the customer's orders from GET /my/orders -> { items:[...] }.
function statusTone(status) {
  if (status === 'cancelled') return 'danger';
  if (status === 'completed') return 'ok';
  return 'warn';
}

export default function OrdersScreen({ navigation }) {
  const { t } = useT();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await my.orders();
      setItems(r.items || r.orders || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
    >
      <ErrorBanner>{error}</ErrorBanner>

      {loading ? (
        <Loading text={t('orders.loading')} />
      ) : items.length === 0 && !error ? (
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
            <Text style={styles.date}>
              {new Date(o.created_at).toLocaleString()}
              {o.item_count != null ? ` · ${t('orders.itemsCount', { n: o.item_count })}` : ''}
            </Text>
            <View style={styles.meta}>
              <Text style={styles.total}>{money(o.total != null ? o.total : o.subtotal)}</Text>
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
  date: { color: colors.textMuted, fontSize: 13, marginTop: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  total: { color: colors.text, fontSize: 16, fontWeight: '800' },
});
