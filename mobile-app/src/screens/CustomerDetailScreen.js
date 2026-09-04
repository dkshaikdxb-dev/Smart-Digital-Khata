import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, Alert, ScrollView, RefreshControl, ActivityIndicator,
} from 'react-native';
import { customers } from '../services/api';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;
const label = (s) => (s || '').replace(/_/g, ' ');

const typeColor = (t) => (t === 'purchase' ? '#f87171' : '#22c55e');

export default function CustomerDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const [customer, setCustomer] = useState(null);
  const [tx, setTx] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const r = await customers.ledger(id);
    setCustomer(r.customer);
    setTx(r.transactions || []);
  }, [id]);

  useEffect(() => {
    load().catch((e) => Alert.alert('Error', e.response?.data?.error || e.message)).finally(() => setLoading(false));
  }, [load]);

  useEffect(() => navigation.addListener('focus', () => { load().catch(() => {}); }), [navigation, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(); } catch (e) { Alert.alert('Error', e.response?.data?.error || e.message); } finally { setRefreshing(false); }
  };

  if (loading) return <View style={s.center}><ActivityIndicator color="#22c55e" /></View>;
  if (!customer) return <View style={s.center}><Text style={s.muted}>Customer not found.</Text></View>;

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e2e8f0" />}
    >
      <View style={s.card}>
        <Text style={s.title}>{customer.name}</Text>
        <Text style={s.muted}>{customer.phone}</Text>
        <View style={s.kpiRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.kpiLabel}>Balance</Text>
            <Text style={[s.kpiValue, Number(customer.balance) > 0 ? { color: '#f87171' } : null]}>{fmt(customer.balance)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.kpiLabel}>Credit limit</Text>
            <Text style={s.kpiValue}>{Number(customer.credit_limit) > 0 ? fmt(customer.credit_limit) : '—'}</Text>
          </View>
        </View>
      </View>

      <Pressable style={s.primary} onPress={() => navigation.navigate('AddTransaction', { customerId: id, customerName: customer.name })}>
        <Text style={s.primaryText}>+ Record payment / purchase</Text>
      </Pressable>

      <Text style={s.sectionLabel}>Transactions</Text>
      {tx.length === 0 ? (
        <Text style={s.empty}>No transactions yet.</Text>
      ) : tx.map((t) => (
        <View key={t.id} style={s.txRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.txType}>{label(t.type)}{t.method ? ` · ${label(t.method)}` : ''}</Text>
            <Text style={s.muted}>{new Date(t.created_at).toLocaleString()}{t.note ? ` · ${t.note}` : ''}</Text>
          </View>
          <Text style={[s.txAmount, { color: typeColor(t.type) }]}>
            {t.type === 'purchase' ? '+' : '−'}{fmt(t.amount)}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  center: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#1e293b', padding: 16, borderRadius: 12, marginBottom: 12 },
  title: { color: '#e2e8f0', fontSize: 20, fontWeight: '700' },
  muted: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  kpiRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  kpiLabel: { color: '#94a3b8', fontSize: 12 },
  kpiValue: { color: '#e2e8f0', fontSize: 20, fontWeight: '700', marginTop: 2 },
  primary: { backgroundColor: '#22c55e', padding: 14, borderRadius: 12, alignItems: 'center', marginBottom: 16 },
  primaryText: { color: '#000', fontWeight: '700', fontSize: 16 },
  sectionLabel: { color: '#94a3b8', fontSize: 13, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  txRow: { backgroundColor: '#1e293b', padding: 14, borderRadius: 10, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  txType: { color: '#e2e8f0', fontSize: 15, fontWeight: '600', textTransform: 'capitalize' },
  txAmount: { fontSize: 16, fontWeight: '700' },
  empty: { color: '#64748b', textAlign: 'center', marginTop: 8 },
});
