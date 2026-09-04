import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, Pressable, Alert, RefreshControl, ActivityIndicator,
} from 'react-native';
import { orders } from '../services/api';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;
const label = (s) => (s || '').replace(/_/g, ' ');
const FILTERS = ['all', 'pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'];

const statusColor = (s) => {
  if (s === 'completed') return '#22c55e';
  if (s === 'cancelled') return '#f87171';
  return '#e2e8f0';
};

export default function OrdersScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (st) => {
    const r = await orders.list(st);
    setItems(r.items || []);
  }, []);

  useEffect(() => {
    load('all').catch((e) => Alert.alert('Error', e.response?.data?.error || e.message)).finally(() => setLoading(false));
  }, [load]);

  // Reload when returning from detail (status may have changed).
  useEffect(() => navigation.addListener('focus', () => { load(status).catch(() => {}); }), [navigation, load, status]);

  function pick(st) {
    setStatus(st);
    load(st).catch((e) => Alert.alert('Error', e.response?.data?.error || e.message));
  }

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(status); } catch (e) { Alert.alert('Error', e.response?.data?.error || e.message); } finally { setRefreshing(false); }
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
              <Text style={[s.chipText, status === f && s.chipTextActive]}>{label(f)}</Text>
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
          ListEmptyComponent={<Text style={s.empty}>No orders in this view yet.</Text>}
          renderItem={({ item }) => (
            <Pressable style={s.row} onPress={() => navigation.navigate('OrderDetail', { id: item.id })}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.customer_name || '—'}</Text>
                <Text style={s.muted}>{new Date(item.created_at).toLocaleString()}</Text>
                <View style={s.badgeRow}>
                  <Text style={s.badge}>{label(item.fulfillment_type)}</Text>
                  <Text style={s.badge}>{item.payment_mode}</Text>
                  <Text style={s.badge}>{label(item.payment_status)}</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.total}>{fmt(item.subtotal)}</Text>
                <Text style={[s.statusText, { color: statusColor(item.status) }]}>{label(item.status)}</Text>
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
