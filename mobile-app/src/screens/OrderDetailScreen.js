import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, Alert, ScrollView, RefreshControl, ActivityIndicator,
} from 'react-native';
import { orders } from '../services/api';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;
const label = (s) => (s || '').replace(/_/g, ' ');
const TERMINAL = ['completed', 'cancelled'];

const statusColor = (s) => {
  if (s === 'completed') return '#22c55e';
  if (s === 'cancelled') return '#f87171';
  return '#e2e8f0';
};

// Sensible forward transitions given the current status (Cancel is separate).
function nextStatuses(order) {
  const isPickup = order.fulfillment_type === 'pickup';
  switch (order.status) {
    case 'pending': return ['accepted'];
    case 'accepted': return ['preparing'];
    case 'preparing': return ['ready'];
    case 'ready': return isPickup ? ['completed'] : ['out_for_delivery'];
    case 'out_for_delivery': return ['completed'];
    default: return [];
  }
}

export default function OrderDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const r = await orders.get(id);
    setOrder(r.order || r);
  }, [id]);

  useEffect(() => {
    load().catch((e) => Alert.alert('Error', e.response?.data?.error || e.message)).finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(); } catch (e) { Alert.alert('Error', e.response?.data?.error || e.message); } finally { setRefreshing(false); }
  };

  async function setStatus(status) {
    setBusy(true); setMsg('');
    try {
      await orders.setStatus(id, status);
      await load();
      setMsg(`Order marked ${label(status)}.`);
    } catch (e) {
      Alert.alert('Failed', e.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    Alert.alert('Cancel order', 'Cancel this order? This cannot be undone.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Cancel order', style: 'destructive', onPress: () => setStatus('cancelled') },
    ]);
  }

  if (loading) return <View style={s.center}><ActivityIndicator color="#22c55e" /></View>;
  if (!order) return <View style={s.center}><Text style={s.muted}>Order not found.</Text></View>;

  const terminal = TERMINAL.includes(order.status);
  const forwards = nextStatuses(order);
  const items = order.items || [];

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e2e8f0" />}
    >
      <View style={s.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{order.customer_name || 'Order'}</Text>
            {order.customer_phone ? <Text style={s.muted}>{order.customer_phone}</Text> : null}
            <Text style={s.muted}>{new Date(order.created_at).toLocaleString()}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.kpi}>{fmt(order.subtotal)}</Text>
            <Text style={[s.statusText, { color: statusColor(order.status) }]}>{label(order.status)}</Text>
          </View>
        </View>
        <View style={s.badgeRow}>
          <Text style={s.badge}>{label(order.fulfillment_type)}</Text>
          <Text style={s.badge}>{order.payment_mode}</Text>
          <Text style={s.badge}>{label(order.payment_status)}</Text>
        </View>

        <View style={s.actions}>
          {forwards.map((st) => (
            <Pressable key={st} style={[s.primary, (busy || terminal) && { opacity: 0.5 }]} onPress={() => setStatus(st)} disabled={busy || terminal}>
              <Text style={s.primaryText}>Mark {label(st)}</Text>
            </Pressable>
          ))}
          <Pressable style={[s.secondary, (busy || terminal) && { opacity: 0.5 }]} onPress={cancel} disabled={busy || terminal}>
            <Text style={s.secondaryText}>Cancel order</Text>
          </Pressable>
        </View>
        {terminal ? <Text style={[s.muted, { marginTop: 10 }]}>This order is {label(order.status)} — no further changes.</Text> : null}
        {msg ? <Text style={[s.muted, { marginTop: 10 }]}>{msg}</Text> : null}
      </View>

      <View style={s.card}>
        <Text style={s.sectionTitle}>Items</Text>
        {items.length === 0 ? (
          <Text style={s.muted}>No items on this order.</Text>
        ) : items.map((it) => (
          <View key={it.id} style={s.itemRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.itemName}>{it.name}</Text>
              <Text style={s.muted}>{fmt(it.unit_price)} × {it.quantity}</Text>
            </View>
            <Text style={s.itemTotal}>{fmt(it.line_total)}</Text>
          </View>
        ))}
        <View style={s.subtotalRow}>
          <Text style={s.muted}>Subtotal</Text>
          <Text style={s.itemTotal}>{fmt(order.subtotal)}</Text>
        </View>
      </View>

      {(order.address || order.note) ? (
        <View style={s.card}>
          <Text style={s.sectionTitle}>Delivery</Text>
          {order.address ? (<><Text style={s.muted}>Address</Text><Text style={s.body}>{order.address}</Text></>) : null}
          {order.note ? (<><Text style={[s.muted, { marginTop: 8 }]}>Note</Text><Text style={s.body}>{order.note}</Text></>) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  center: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#1e293b', padding: 16, borderRadius: 12, marginBottom: 12 },
  title: { color: '#e2e8f0', fontSize: 20, fontWeight: '700' },
  muted: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  body: { color: '#e2e8f0', fontSize: 14, marginTop: 2 },
  kpi: { color: '#e2e8f0', fontSize: 22, fontWeight: '800' },
  statusText: { fontSize: 14, fontWeight: '700', marginTop: 4, textTransform: 'capitalize' },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' },
  badge: { color: '#94a3b8', fontSize: 11, backgroundColor: '#0f172a', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, textTransform: 'capitalize' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap' },
  primary: { backgroundColor: '#22c55e', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10 },
  primaryText: { color: '#000', fontWeight: '700', textTransform: 'capitalize' },
  secondary: { backgroundColor: '#334155', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10 },
  secondaryText: { color: '#e2e8f0', fontWeight: '600' },
  sectionTitle: { color: '#e2e8f0', fontSize: 16, fontWeight: '700', marginBottom: 10 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#0f172a' },
  itemName: { color: '#e2e8f0', fontSize: 14, fontWeight: '600' },
  itemTotal: { color: '#e2e8f0', fontSize: 14, fontWeight: '700' },
  subtotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
});
