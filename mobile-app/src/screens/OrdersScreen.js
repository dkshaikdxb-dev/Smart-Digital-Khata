import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, Pressable, Alert, RefreshControl, ActivityIndicator,
} from 'react-native';
import { orders, isAuthError } from '../services/api';
import { useT } from '../i18n';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;
const label = (s) => (s || '').replace(/_/g, ' ');
const FILTERS = ['all', 'pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'];
const OSTATUS = new Set(['pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled']);
const FUL = new Set(['delivery', 'pickup']);
const PMODE = new Set(['credit', 'prepaid', 'cash']);
const PSTATUS = new Set(['paid', 'pending', 'failed', 'not_required']);

const statusColor = (s) => {
  if (s === 'completed') return '#22c55e';
  if (s === 'cancelled') return '#f87171';
  return '#e2e8f0';
};

export default function OrdersScreen({ navigation }) {
  const { t } = useT();
  // Localize known order enums; fall back to the de-underscored raw value for any
  // value not in the set, so a label is never blank.
  const enumT = (prefix, set, v) => (set.has(v) ? t(`${prefix}.${v}`) : label(v));
  const filterLabel = (f) => (f === 'all' ? t('ofilter.all') : enumT('ostatus', OSTATUS, f));
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (st) => {
    const r = await orders.list(st);
    setItems(r.items || []);
  }, []);

  useEffect(() => {
    load('all').catch((e) => { if (!isAuthError(e)) Alert.alert(t('common.error'), e.response?.data?.error || e.message); }).finally(() => setLoading(false));
  }, [load, t]);

  // Reload when returning from detail (status may have changed).
  useEffect(() => navigation.addListener('focus', () => { load(status).catch(() => {}); }), [navigation, load, status]);

  function pick(st) {
    setStatus(st);
    load(st).catch((e) => { if (!isAuthError(e)) Alert.alert(t('common.error'), e.response?.data?.error || e.message); });
  }

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(status); } catch (e) { if (!isAuthError(e)) Alert.alert(t('common.error'), e.response?.data?.error || e.message); } finally { setRefreshing(false); }
  };

  return (
    <View style={s.container}>
      <View style={s.filterWrap}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={FILTERS}
          keyExtractor={(f) => f}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 12 }}
          renderItem={({ item: f }) => (
            <Pressable onPress={() => pick(f)} style={[s.chip, status === f && s.chipActive]}>
              <Text style={[s.chipText, status === f && s.chipTextActive]}>{filterLabel(f)}</Text>
            </Pressable>
          )}
        />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color="#22c55e" /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, paddingTop: 4 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e2e8f0" />}
          ListEmptyComponent={<Text style={s.empty}>{t('ord.empty')}</Text>}
          renderItem={({ item }) => (
            <Pressable style={s.row} onPress={() => navigation.navigate('OrderDetail', { id: item.id })}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.customer_name || '—'}</Text>
                <Text style={s.muted}>{new Date(item.created_at).toLocaleString()}</Text>
                <View style={s.badgeRow}>
                  <Text style={s.badge}>{enumT('ful', FUL, item.fulfillment_type)}</Text>
                  <Text style={s.badge}>{enumT('pmode', PMODE, item.payment_mode)}</Text>
                  <Text style={s.badge}>{enumT('pstatus', PSTATUS, item.payment_status)}</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.total}>{fmt(item.subtotal)}</Text>
                <Text style={[s.statusText, { color: statusColor(item.status) }]}>{enumT('ostatus', OSTATUS, item.status)}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  filterWrap: { borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  chip: { backgroundColor: '#1e293b', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  chipActive: { backgroundColor: '#22c55e' },
  chipText: { color: '#94a3b8', textTransform: 'capitalize' },
  chipTextActive: { color: '#000', fontWeight: '700' },
  row: { backgroundColor: '#1e293b', padding: 14, borderRadius: 10, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  name: { color: '#e2e8f0', fontSize: 16, fontWeight: '600' },
  muted: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  badge: { color: '#94a3b8', fontSize: 11, backgroundColor: '#0f172a', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, textTransform: 'capitalize' },
  total: { color: '#e2e8f0', fontSize: 16, fontWeight: '700' },
  statusText: { fontSize: 13, fontWeight: '700', marginTop: 6, textTransform: 'capitalize' },
  empty: { color: '#64748b', textAlign: 'center', marginTop: 24 },
});
