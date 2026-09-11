import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, StyleSheet, Pressable, Alert,
  RefreshControl, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { families, isAuthError } from '../services/api';
import { useT } from '../i18n';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;

export default function FamiliesScreen({ navigation }) {
  const { t } = useT();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [name, setName] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await families.list();
    setItems(r.items || []);
  }, []);

  useEffect(() => {
    load().catch((e) => { if (!isAuthError(e)) Alert.alert(t('common.error'), e.response?.data?.error || e.message); }).finally(() => setLoading(false));
  }, [load, t]);

  useEffect(() => navigation.addListener('focus', () => { load().catch(() => {}); }), [navigation, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(); } catch (e) { if (!isAuthError(e)) Alert.alert(t('common.error'), e.response?.data?.error || e.message); } finally { setRefreshing(false); }
  };

  async function create() {
    if (!name.trim()) return Alert.alert(t('common.missing'), t('fam.missingName'));
    setSaving(true);
    try {
      await families.create({
        name: name.trim(),
        credit_limit: Math.round(Number(creditLimit || 0) * 100),
      });
      setName(''); setCreditLimit('');
      await load();
    } catch (e) {
      if (!isAuthError(e)) Alert.alert(t('common.failed'), e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  }

  const header = (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.formCard}>
        <Text style={s.formTitle}>{t('fam.new')}</Text>
        <TextInput style={s.input} placeholder={t('fam.namePlaceholder')} placeholderTextColor="#64748b" value={name} onChangeText={setName} />
        <TextInput style={s.input} placeholder={t('fam.limitPlaceholder')} placeholderTextColor="#64748b" keyboardType="decimal-pad" value={creditLimit} onChangeText={setCreditLimit} />
        <Pressable style={[s.primary, saving && { opacity: 0.6 }]} onPress={create} disabled={saving}>
          <Text style={s.primaryText}>{saving ? t('fam.creating') : `+ ${t('fam.create')}`}</Text>
        </Pressable>
        <Text style={s.hint}>{t('fam.hint')}</Text>
      </View>
      <Text style={s.sectionLabel}>{t('fam.families')}</Text>
    </KeyboardAvoidingView>
  );

  if (loading) return <View style={s.center}><ActivityIndicator color="#22c55e" /></View>;

  return (
    <FlatList
      style={s.container}
      contentContainerStyle={{ padding: 16 }}
      data={items}
      keyExtractor={(i) => i.id}
      ListHeaderComponent={header}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e2e8f0" />}
      ListEmptyComponent={<Text style={s.empty}>{t('fam.empty')}</Text>}
      renderItem={({ item }) => (
        <Pressable style={s.row} onPress={() => navigation.navigate('FamilyDetail', { id: item.id, name: item.name })}>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{item.name}</Text>
            <Text style={s.muted}>{t('fam.membersN', { n: Number(item.member_count), s: Number(item.member_count) === 1 ? '' : 's' })}</Text>
          </View>
          <Text style={[s.balance, Number(item.combined_balance) > 0 ? { color: '#f87171' } : { color: '#94a3b8' }]}>{fmt(item.combined_balance)}</Text>
        </Pressable>
      )}
    />
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  center: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' },
  formCard: { backgroundColor: '#1e293b', padding: 14, borderRadius: 12, marginBottom: 16, gap: 8 },
  formTitle: { color: '#e2e8f0', fontSize: 16, fontWeight: '700', marginBottom: 2 },
  input: { backgroundColor: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 10 },
  primary: { backgroundColor: '#22c55e', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 4 },
  primaryText: { color: '#000', fontWeight: '700' },
  hint: { color: '#64748b', fontSize: 12, marginTop: 2 },
  sectionLabel: { color: '#94a3b8', fontSize: 13, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { backgroundColor: '#1e293b', padding: 14, borderRadius: 10, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { color: '#e2e8f0', fontSize: 16, fontWeight: '600' },
  muted: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  balance: { fontSize: 16, fontWeight: '700' },
  empty: { color: '#64748b', textAlign: 'center', marginTop: 24 },
});
