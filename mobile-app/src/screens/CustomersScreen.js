import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TextInput, StyleSheet, Pressable, Alert } from 'react-native';
import { customers } from '../services/api';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;

export default function CustomersScreen() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');

  async function load() {
    try {
      const r = await customers.list(search);
      setItems(r.items);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || e.message);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  return (
    <View style={s.container}>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <TextInput style={[s.input, { flex: 1 }]} placeholder="Search" placeholderTextColor="#64748b" value={search} onChangeText={setSearch} />
        <Pressable style={s.button} onPress={load}><Text style={s.buttonText}>Go</Text></Pressable>
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <View style={s.row}>
            <View>
              <Text style={s.name}>{item.name}</Text>
              <Text style={s.muted}>{item.phone}</Text>
            </View>
            <Text style={[s.balance, Number(item.balance) > 0 ? { color: '#f87171' } : { color: '#94a3b8' }]}>{fmt(item.balance)}</Text>
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  input: { backgroundColor: '#1e293b', color: '#e2e8f0', padding: 10, borderRadius: 10 },
  button: { backgroundColor: '#22c55e', paddingHorizontal: 14, justifyContent: 'center', borderRadius: 10 },
  buttonText: { color: '#000', fontWeight: '700' },
  row: { backgroundColor: '#1e293b', padding: 14, borderRadius: 10, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { color: '#e2e8f0', fontSize: 16, fontWeight: '600' },
  muted: { color: '#94a3b8', fontSize: 12 },
  balance: { fontSize: 16, fontWeight: '700' },
});
