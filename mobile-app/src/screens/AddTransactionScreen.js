import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView } from 'react-native';
import { customers, transactions } from '../services/api';

export default function AddTransactionScreen({ navigation }) {
  const [list, setList] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [type, setType] = useState('purchase');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    customers.list().then((r) => setList(r.items)).catch(() => {});
  }, []);

  async function save() {
    if (!customerId || !amount) return Alert.alert('Missing', 'Pick a customer and amount');
    try {
      await transactions.create({
        customer_id: customerId,
        type,
        amount: Math.round(Number(amount) * 100),
        method: type === 'purchase' ? 'credit' : type,
        note: note || null,
      });
      navigation.goBack();
    } catch (e) {
      Alert.alert('Failed', e.response?.data?.error || e.message);
    }
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={s.label}>Type</Text>
      <View style={s.typeRow}>
        {['purchase', 'cash', 'upi'].map((t) => (
          <Pressable key={t} onPress={() => setType(t)} style={[s.pill, type === t && s.pillActive]}>
            <Text style={[s.pillText, type === t && s.pillTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.label}>Customer</Text>
      <View style={{ gap: 6 }}>
        {list.map((c) => (
          <Pressable key={c.id} onPress={() => setCustomerId(c.id)} style={[s.cust, customerId === c.id && s.custActive]}>
            <Text style={{ color: '#e2e8f0' }}>{c.name} — {c.phone}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.label}>Amount (₹)</Text>
      <TextInput style={s.input} placeholder="0" placeholderTextColor="#64748b" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
      <Text style={s.label}>Note (optional)</Text>
      <TextInput style={s.input} placeholder="note" placeholderTextColor="#64748b" value={note} onChangeText={setNote} />

      <Pressable style={s.button} onPress={save}>
        <Text style={s.buttonText}>Save</Text>
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
