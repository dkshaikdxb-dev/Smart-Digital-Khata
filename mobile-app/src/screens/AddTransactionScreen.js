import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView } from 'react-native';
import { customers, transactions, isAuthError } from '../services/api';
import { useT } from '../i18n';

export default function AddTransactionScreen({ navigation, route }) {
  const { t, lang } = useT();
  const preId = route?.params?.customerId || '';
  const preName = route?.params?.customerName || '';
  const [list, setList] = useState([]);
  const [customerId, setCustomerId] = useState(preId);
  const [type, setType] = useState('purchase');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (preId) return; // customer already chosen from their detail screen
    customers.list('', lang).then((r) => setList(r.items)).catch(() => {});
  }, [preId, lang]);

  async function save() {
    if (!customerId || !amount) return Alert.alert(t('common.missing'), t('addtx.missingBody'));
    // Reject "0", negatives, and non-numeric input up front so they never reach
    // the backend as a 400 — require a finite amount strictly greater than zero.
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return Alert.alert(t('common.missing'), t('add.invalidAmount'));
    try {
      await transactions.create({
        customer_id: customerId,
        type,
        amount: Math.round(amt * 100),
        method: type === 'purchase' ? 'credit' : type,
        note: note || null,
      });
      navigation.goBack();
    } catch (e) {
      if (!isAuthError(e)) Alert.alert(t('common.failed'), e.response?.data?.error || e.message);
    }
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={s.label}>{t('addtx.type')}</Text>
      <View style={s.typeRow}>
        {['purchase', 'cash', 'upi'].map((ty) => (
          <Pressable key={ty} onPress={() => setType(ty)} style={[s.pill, type === ty && s.pillActive]}>
            <Text style={[s.pillText, type === ty && s.pillTextActive]}>{t(`txn.${ty}`)}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.label}>{t('addtx.customer')}</Text>
      {preId ? (
        <View style={[s.cust, s.custActive]}>
          <Text style={{ color: '#e2e8f0' }}>{preName || t('addtx.selectedCustomer')}</Text>
        </View>
      ) : (
        <View style={{ gap: 6 }}>
          {list.map((c) => (
            <Pressable key={c.id} onPress={() => setCustomerId(c.id)} style={[s.cust, customerId === c.id && s.custActive]}>
              <Text style={{ color: '#e2e8f0' }}>{c.name_local || c.name} — {c.phone}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Text style={s.label}>{t('addtx.amount')}</Text>
      <TextInput style={s.input} placeholder="0" placeholderTextColor="#64748b" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
      <Text style={s.label}>{t('addtx.note')}</Text>
      <TextInput style={s.input} placeholder={t('addtx.notePlaceholder')} placeholderTextColor="#64748b" value={note} onChangeText={setNote} />

      <Pressable style={s.button} onPress={save}>
        <Text style={s.buttonText}>{t('common.save')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  label: { color: '#94a3b8', marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: '#1e293b', color: '#e2e8f0', padding: 12, borderRadius: 10 },
  typeRow: { flexDirection: 'row', gap: 8 },
  pill: { backgroundColor: '#1e293b', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  pillActive: { backgroundColor: '#22c55e' },
  pillText: { color: '#94a3b8', textTransform: 'capitalize' },
  pillTextActive: { color: '#000', fontWeight: '700' },
  cust: { backgroundColor: '#1e293b', padding: 12, borderRadius: 10 },
  custActive: { borderColor: '#22c55e', borderWidth: 1 },
  button: { backgroundColor: '#22c55e', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 20 },
  buttonText: { color: '#000', fontWeight: '700' },
});
