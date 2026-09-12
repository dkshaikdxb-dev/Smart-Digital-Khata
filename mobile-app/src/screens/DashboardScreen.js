import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { summary, isAuthError } from '../services/api';
import { useT } from '../i18n';
import AskShop from './AskShop';
import ShopAvailabilityCard from './ShopAvailabilityCard';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;

export default function DashboardScreen({ navigation }) {
  const { t } = useT();
  const [today, setToday] = useState(null);
  const [out, setOut] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [t, o] = await Promise.all([summary.today(), summary.outstanding()]);
    setToday(t); setOut(o);
  }, []);

  // Refetch every time the screen regains focus (not just on first mount), so
  // returning to Home — e.g. after adding a transaction, or switching back from
  // another tab — always shows the current totals instead of a stale snapshot.
  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(); }
    catch (e) { if (!isAuthError(e)) Alert.alert(t('common.error'), e.response?.data?.error || e.message); }
    finally { setRefreshing(false); }
  };

  return (
    <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e2e8f0" />}>
      {/* Shop availability (batch A) — deliberately the FIRST card on Home, the
          mirror of the owner web console. "Are we open?" is the switch a
          shopkeeper reaches for mid-rush, so it is never buried in Settings. */}
      <ShopAvailabilityCard />
      <AskShop />
      <View style={s.row}>
        <Card label={t('dash.todayPurchases')} value={today ? fmt(today.purchases) : '—'} />
        <Card label={t('dash.todayCollections')} value={today ? fmt(today.collections) : '—'} />
      </View>
      <View style={s.row}>
        <Card label={t('dash.totalOutstanding')} value={out ? fmt(out.total) : '—'} />
        <Card label={t('dash.customersWithDues')} value={out ? String(out.customers.length) : '—'} />
      </View>

      <Pressable style={s.primary} onPress={() => navigation.navigate('AddTransaction')}>
        <Text style={s.primaryText}>+ {t('dash.newTransaction')}</Text>
      </Pressable>
      <Pressable style={s.secondary} onPress={() => navigation.navigate('CustomersTab')}>
        <Text style={s.secondaryText}>{t('dash.viewCustomers')}</Text>
      </Pressable>
    </ScrollView>
  );
}

function Card({ label, value }) {
  return (
    <View style={s.card}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  card: { flex: 1, backgroundColor: '#1e293b', padding: 16, borderRadius: 12 },
  label: { color: '#94a3b8', fontSize: 13 },
  value: { color: '#e2e8f0', fontSize: 22, fontWeight: '700', marginTop: 4 },
  primary: { backgroundColor: '#22c55e', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  primaryText: { color: '#000', fontWeight: '700', fontSize: 16 },
  secondary: { backgroundColor: '#334155', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  secondaryText: { color: '#e2e8f0', fontWeight: '600' },
});
