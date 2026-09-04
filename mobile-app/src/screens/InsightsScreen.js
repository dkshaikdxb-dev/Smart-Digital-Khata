import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, Alert, ScrollView, RefreshControl, ActivityIndicator,
} from 'react-native';
import { analytics } from '../services/api';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;
const pct = (f) => `${Math.round(Number(f || 0) * 100)}%`;
const DAYS = [7, 30, 90];

const AGING = [
  { key: '0_30', label: '0–30 days' },
  { key: '31_60', label: '31–60 days' },
  { key: '61_90', label: '61–90 days' },
  { key: '90_plus', label: '90+ days' },
];

export default function InsightsScreen() {
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState(null);
  const [aging, setAging] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (d) => {
    const [o, a] = await Promise.all([analytics.overview(d), analytics.aging()]);
    setOverview(o);
    setAging(a);
  }, []);

  useEffect(() => {
    load(days).catch((e) => Alert.alert('Error', e.response?.data?.error || e.message)).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pick(d) {
    setDays(d);
    load(d).catch((e) => Alert.alert('Error', e.response?.data?.error || e.message));
  }

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(days); } catch (e) { Alert.alert('Error', e.response?.data?.error || e.message); } finally { setRefreshing(false); }
  };

  if (loading) return <View style={s.center}><ActivityIndicator color="#22c55e" /></View>;

  const agingTotal = Number(aging?.total || 0);

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e2e8f0" />}
    >
      <View style={s.chips}>
        {DAYS.map((d) => (
          <Pressable key={d} onPress={() => pick(d)} style={[s.chip, days === d && s.chipActive]}>
            <Text style={[s.chipText, days === d && s.chipTextActive]}>{d} days</Text>
          </Pressable>
        ))}
      </View>

      <View style={s.grid}>
        <Card label="Purchases" value={fmt(overview?.purchases)} />
        <Card label="Collections" value={fmt(overview?.collections)} />
        <Card label="Collection rate" value={pct(overview?.collection_rate)} />
        <Card label="Outstanding" value={fmt(overview?.total_outstanding)} />
        <Card label="Active customers" value={String(overview?.active_customers ?? '—')} />
        <Card label="With dues" value={String(overview?.customers_with_dues ?? '—')} />
        <Card label="New customers" value={String(overview?.new_customers ?? '—')} />
      </View>

      <Text style={s.sectionLabel}>Outstanding by age</Text>
      <View style={s.card}>
        {AGING.map(({ key, label }) => {
          const val = Number(aging?.[key] || 0);
          const w = agingTotal > 0 ? Math.max(2, Math.round((val / agingTotal) * 100)) : 0;
          return (
            <View key={key} style={s.ageRow}>
              <View style={s.ageHead}>
                <Text style={s.ageLabel}>{label}</Text>
                <Text style={s.ageValue}>{fmt(val)}</Text>
              </View>
              <View style={s.barTrack}>
                <View style={[s.barFill, { width: `${w}%` }]} />
              </View>
            </View>
          );
        })}
        <View style={s.totalRow}>
          <Text style={s.ageLabel}>Total</Text>
          <Text style={s.ageValue}>{fmt(agingTotal)}</Text>
        </View>
      </View>

      <Text style={s.footnote}>CSV report export is available on the web dashboard.</Text>
    </ScrollView>
  );
}

function Card({ label, value }) {
  return (
    <View style={s.kpiCard}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={s.kpiValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  center: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  chip: { backgroundColor: '#1e293b', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
  chipActive: { backgroundColor: '#22c55e' },
  chipText: { color: '#94a3b8' },
  chipTextActive: { color: '#000', fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 8 },
  kpiCard: { backgroundColor: '#1e293b', padding: 16, borderRadius: 12, width: '47%', flexGrow: 1 },
  kpiLabel: { color: '#94a3b8', fontSize: 13 },
  kpiValue: { color: '#e2e8f0', fontSize: 20, fontWeight: '700', marginTop: 4 },
  sectionLabel: { color: '#94a3b8', fontSize: 13, marginTop: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { backgroundColor: '#1e293b', padding: 16, borderRadius: 12 },
  ageRow: { marginBottom: 14 },
  ageHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  ageLabel: { color: '#94a3b8', fontSize: 13 },
  ageValue: { color: '#e2e8f0', fontSize: 14, fontWeight: '700' },
  barTrack: { height: 8, backgroundColor: '#0f172a', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: '#22c55e', borderRadius: 4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#0f172a', paddingTop: 12 },
  footnote: { color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 16 },
});
