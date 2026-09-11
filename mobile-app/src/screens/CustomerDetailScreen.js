import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, Alert, ScrollView, RefreshControl, ActivityIndicator,
} from 'react-native';
import { customers, isAuthError } from '../services/api';
import { useT } from '../i18n';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;
const label = (s) => (s || '').replace(/_/g, ' ');

const typeColor = (ty) => (ty === 'purchase' ? '#f87171' : '#22c55e');

export default function CustomerDetailScreen({ route, navigation }) {
  const { t } = useT();
  const { id } = route.params;
  // Localize the known transaction type words; fall back to the raw enum for any
  // other value so nothing shows blank.
  const typeLabel = (v) => (v === 'purchase' || v === 'cash' || v === 'upi' ? t(`txn.${v}`) : label(v));
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
    load().catch((e) => { if (!isAuthError(e)) Alert.alert(t('common.error'), e.response?.data?.error || e.message); }).finally(() => setLoading(false));
  }, [load, t]);

  useEffect(() => navigation.addListener('focus', () => { load().catch(() => {}); }), [navigation, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(); } catch (e) { if (!isAuthError(e)) Alert.alert(t('common.error'), e.response?.data?.error || e.message); } finally { setRefreshing(false); }
  };

  if (loading) return <View style={s.center}><ActivityIndicator color="#22c55e" /></View>;
  if (!customer) return <View style={s.center}><Text style={s.muted}>{t('custd.notFound')}</Text></View>;

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
            <Text style={s.kpiLabel}>{t('custd.balance')}</Text>
            <Text style={[s.kpiValue, Number(customer.balance) > 0 ? { color: '#f87171' } : null]}>{fmt(customer.balance)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.kpiLabel}>{t('custd.creditLimit')}</Text>
            <Text style={s.kpiValue}>{Number(customer.credit_limit) > 0 ? fmt(customer.credit_limit) : '—'}</Text>
          </View>
        </View>
      </View>

      <Pressable style={s.primary} onPress={() => navigation.navigate('AddTransaction', { customerId: id, customerName: customer.name })}>
        <Text style={s.primaryText}>+ {t('custd.recordAction')}</Text>
      </Pressable>

      <Text style={s.sectionLabel}>{t('custd.transactions')}</Text>
      {tx.length === 0 ? (
        <Text style={s.empty}>{t('custd.noTransactions')}</Text>
      ) : tx.map((row) => (
        <View key={row.id} style={s.txRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.txType}>{typeLabel(row.type)}{row.method ? ` · ${label(row.method)}` : ''}</Text>
            <Text style={s.muted}>{new Date(row.created_at).toLocaleString()}{row.note ? ` · ${row.note}` : ''}</Text>
          </View>
          <Text style={[s.txAmount, { color: typeColor(row.type) }]}>
            {row.type === 'purchase' ? '+' : '−'}{fmt(row.amount)}
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
