import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, Alert, ScrollView, RefreshControl, ActivityIndicator,
} from 'react-native';
import { families, customers, isAuthError } from '../services/api';
import { useT } from '../i18n';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;
const label = (s) => (s || '').replace(/_/g, ' ');

export default function FamilyDetailScreen({ route, navigation }) {
  const { t } = useT();
  // Localize the known transaction type words; fall back to the raw enum otherwise.
  const typeLabel = (v) => (v === 'purchase' || v === 'cash' || v === 'upi' ? t(`txn.${v}`) : label(v));
  const { id } = route.params;
  const [detail, setDetail] = useState(null);
  const [statement, setStatement] = useState([]);
  const [allCustomers, setAllCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [d, st, cs] = await Promise.all([
      families.get(id),
      families.statement(id),
      customers.list(),
    ]);
    setDetail(d);
    setStatement(st.transactions || []);
    setAllCustomers(cs.items || []);
  }, [id]);

  useEffect(() => {
    load().catch((e) => { if (!isAuthError(e)) Alert.alert(t('common.error'), e.response?.data?.error || e.message); }).finally(() => setLoading(false));
  }, [load, t]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(); } catch (e) { if (!isAuthError(e)) Alert.alert(t('common.error'), e.response?.data?.error || e.message); } finally { setRefreshing(false); }
  };

  async function addMember(customerId) {
    setBusy(true);
    try { await families.addMember(id, { customer_id: customerId }); setShowPicker(false); await load(); }
    catch (e) { if (!isAuthError(e)) Alert.alert(t('common.failed'), e.response?.data?.error || e.message); }
    finally { setBusy(false); }
  }

  function confirmRemove(member) {
    Alert.alert(t('famd.removeTitle'), t('famd.removeConfirm', { name: member.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.remove'), style: 'destructive', onPress: async () => {
          try { await families.removeMember(id, member.id); await load(); }
          catch (e) { if (!isAuthError(e)) Alert.alert(t('common.failed'), e.response?.data?.error || e.message); }
        },
      },
    ]);
  }

  async function remind() {
    setBusy(true);
    try {
      const r = await families.remind(id);
      Alert.alert(
        t('famd.reminderTitle'),
        r.sent
          ? t('famd.reminderSent', { amt: fmt(r.combined_outstanding) })
          : t('famd.reminderNotSent', { amt: fmt(r.combined_outstanding) })
      );
    } catch (e) {
      if (!isAuthError(e)) Alert.alert(t('common.failed'), e.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <View style={s.center}><ActivityIndicator color="#22c55e" /></View>;
  if (!detail) return <View style={s.center}><Text style={s.muted}>{t('famd.notFound')}</Text></View>;

  const memberIds = new Set((detail.members || []).map((m) => m.id));
  const candidates = allCustomers.filter((c) => !memberIds.has(c.id));

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e2e8f0" />}
    >
      <View style={s.card}>
        <Text style={s.title}>{detail.family?.name}</Text>
        <View style={s.kpiRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.kpiLabel}>{t('famd.combinedOutstanding')}</Text>
            <Text style={[s.kpiValue, Number(detail.combined_balance) > 0 ? { color: '#f87171' } : null]}>{fmt(detail.combined_balance)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.kpiLabel}>{t('famd.combinedLimit')}</Text>
            <Text style={s.kpiValue}>{Number(detail.combined_limit) > 0 ? fmt(detail.combined_limit) : '—'}</Text>
          </View>
        </View>
        <Text style={s.muted}>{t('famd.payerLabel')}: {detail.payer?.name || t('famd.notSet')}</Text>
        <Pressable style={[s.primary, busy && { opacity: 0.6 }]} onPress={remind} disabled={busy}>
          <Text style={s.primaryText}>{t('famd.sendReminder')}</Text>
        </Pressable>
      </View>

      <View style={s.card}>
        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>{t('famd.members')}</Text>
          <Pressable onPress={() => setShowPicker((v) => !v)}><Text style={s.action}>{showPicker ? t('common.close') : `+ ${t('common.add')}`}</Text></Pressable>
        </View>

        {showPicker ? (
          <View style={s.picker}>
            {candidates.length === 0 ? (
              <Text style={s.muted}>{t('famd.noCandidates')}</Text>
            ) : candidates.map((c) => (
              <Pressable key={c.id} style={s.pickRow} onPress={() => addMember(c.id)} disabled={busy}>
                <Text style={s.body}>{c.name}</Text>
                <Text style={s.muted}>{c.phone}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {(detail.members || []).length === 0 ? (
          <Text style={s.muted}>{t('famd.noMembers')}</Text>
        ) : detail.members.map((m) => (
          <View key={m.id} style={s.memberRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.body}>{m.name}{detail.payer?.id === m.id ? `  ${t('famd.payerTag')}` : ''}</Text>
              <Text style={s.muted}>{m.phone} · {fmt(m.balance)}{m.sub_limit != null ? ` · ${t('famd.subLimit', { amt: fmt(m.sub_limit) })}` : ''}</Text>
            </View>
            <Pressable onPress={() => confirmRemove(m)}><Text style={[s.action, { color: '#f87171' }]}>{t('common.remove')}</Text></Pressable>
          </View>
        ))}
      </View>

      <View style={s.card}>
        <Text style={s.sectionTitle}>{t('famd.combinedStatement')}</Text>
        {statement.length === 0 ? (
          <Text style={s.muted}>{t('famd.noTransactions')}</Text>
        ) : statement.map((row) => (
          <View key={row.id} style={s.txRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.body}>{row.customer_name} · {typeLabel(row.type)}</Text>
              <Text style={s.muted}>{new Date(row.created_at).toLocaleString()}{row.note ? ` · ${row.note}` : ''}</Text>
            </View>
            <Text style={[s.txAmount, { color: row.type === 'purchase' ? '#f87171' : '#22c55e' }]}>
              {row.type === 'purchase' ? '+' : '−'}{fmt(row.amount)}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  center: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#1e293b', padding: 16, borderRadius: 12, marginBottom: 12 },
  title: { color: '#e2e8f0', fontSize: 20, fontWeight: '700' },
  muted: { color: '#94a3b8', fontSize: 12, marginTop: 6 },
  body: { color: '#e2e8f0', fontSize: 14, fontWeight: '600' },
  kpiRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  kpiLabel: { color: '#94a3b8', fontSize: 12 },
  kpiValue: { color: '#e2e8f0', fontSize: 20, fontWeight: '700', marginTop: 2 },
  primary: { backgroundColor: '#22c55e', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 14 },
  primaryText: { color: '#000', fontWeight: '700' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { color: '#e2e8f0', fontSize: 16, fontWeight: '700' },
  action: { color: '#22c55e', fontSize: 14, fontWeight: '600' },
  picker: { backgroundColor: '#0f172a', borderRadius: 10, padding: 8, marginBottom: 12, gap: 4 },
  pickRow: { padding: 10, borderRadius: 8 },
  memberRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#0f172a' },
  txRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#0f172a', gap: 10 },
  txAmount: { fontSize: 15, fontWeight: '700' },
});
