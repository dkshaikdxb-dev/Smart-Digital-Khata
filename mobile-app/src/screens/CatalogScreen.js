import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, StyleSheet, Pressable, Alert,
  RefreshControl, KeyboardAvoidingView, Platform, ActivityIndicator, Switch,
} from 'react-native';
import { products } from '../services/api';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;

export default function CatalogScreen() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('unit');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editPriceVal, setEditPriceVal] = useState('');

  const load = useCallback(async () => {
    const r = await products.list();
    setItems(r.items || []);
  }, []);

  useEffect(() => {
    load().catch((e) => Alert.alert('Error', e.response?.data?.error || e.message)).finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(); } catch (e) { Alert.alert('Error', e.response?.data?.error || e.message); } finally { setRefreshing(false); }
  };

  async function add() {
    if (!name.trim()) return Alert.alert('Missing', 'Enter a product name');
    setSaving(true);
    try {
      await products.create({
        name: name.trim(),
        price: Math.round(Number(price || 0) * 100),
        unit: unit.trim() || 'unit',
        description: description.trim() || null,
      });
      setName(''); setPrice(''); setUnit('unit'); setDescription('');
      await load();
    } catch (e) {
      Alert.alert('Failed', e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item) {
    try {
      await products.update(item.id, { is_active: !item.is_active });
      await load();
    } catch (e) {
      Alert.alert('Failed', e.response?.data?.error || e.message);
    }
  }

  function confirmDelete(item) {
    Alert.alert('Delete product', `Delete "${item.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try { await products.remove(item.id); await load(); }
          catch (e) { Alert.alert('Failed', e.response?.data?.error || e.message); }
        },
      },
    ]);
  }

  function editPrice(item) {
    // Alert.prompt is iOS-only. On Android, fall back to the inline edit row.
    if (Platform.OS !== 'ios' || typeof Alert.prompt !== 'function') {
      setEditing(item.id);
      setEditPriceVal(String((Number(item.price || 0) / 100).toFixed(2)));
      return;
    }
    Alert.prompt(
      'Edit price (₹)',
      item.name,
      async (val) => {
        if (val == null || val === '') return;
        try { await products.update(item.id, { price: Math.round(Number(val) * 100) }); await load(); }
        catch (e) { Alert.alert('Failed', e.response?.data?.error || e.message); }
      },
      'plain-text',
      String((Number(item.price || 0) / 100).toFixed(2)),
      'decimal-pad'
    );
  }

  async function saveEditPrice(item) {
    try {
      await products.update(item.id, { price: Math.round(Number(editPriceVal || 0) * 100) });
      setEditing(null); setEditPriceVal('');
      await load();
    } catch (e) {
      Alert.alert('Failed', e.response?.data?.error || e.message);
    }
  }

  const header = (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.formCard}>
        <Text style={s.formTitle}>Add product</Text>
        <TextInput style={s.input} placeholder="Name" placeholderTextColor="#64748b" value={name} onChangeText={setName} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput style={[s.input, { flex: 1 }]} placeholder="Price (₹)" placeholderTextColor="#64748b" keyboardType="decimal-pad" value={price} onChangeText={setPrice} />
          <TextInput style={[s.input, { flex: 1 }]} placeholder="Unit (e.g. kg)" placeholderTextColor="#64748b" value={unit} onChangeText={setUnit} />
        </View>
        <TextInput style={s.input} placeholder="Description (optional)" placeholderTextColor="#64748b" value={description} onChangeText={setDescription} />
        <Pressable style={[s.primary, saving && { opacity: 0.6 }]} onPress={add} disabled={saving}>
          <Text style={s.primaryText}>{saving ? 'Adding…' : '+ Add product'}</Text>
        </Pressable>
      </View>
      <Text style={s.sectionLabel}>Products</Text>
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
      ListEmptyComponent={<Text style={s.empty}>No products yet. Add your first above.</Text>}
      renderItem={({ item }) => (
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{item.name}</Text>
            <Text style={s.muted}>{fmt(item.price)} / {item.unit}{item.description ? ` · ${item.description}` : ''}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={s.muted}>{item.is_active ? 'Active' : 'Hidden'}</Text>
              <Switch value={!!item.is_active} onValueChange={() => toggleActive(item)} trackColor={{ true: '#22c55e', false: '#334155' }} thumbColor="#e2e8f0" />
            </View>
            {editing === item.id ? (
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <TextInput style={s.editInput} keyboardType="decimal-pad" value={editPriceVal} onChangeText={setEditPriceVal} autoFocus />
                <Pressable onPress={() => saveEditPrice(item)}><Text style={s.action}>Save</Text></Pressable>
                <Pressable onPress={() => { setEditing(null); setEditPriceVal(''); }}><Text style={s.muted}>Cancel</Text></Pressable>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={() => editPrice(item)}><Text style={s.action}>Edit ₹</Text></Pressable>
                <Pressable onPress={() => confirmDelete(item)}><Text style={[s.action, { color: '#f87171' }]}>Delete</Text></Pressable>
              </View>
            )}
          </View>
        </View>
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
  sectionLabel: { color: '#94a3b8', fontSize: 13, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { backgroundColor: '#1e293b', padding: 14, borderRadius: 10, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  name: { color: '#e2e8f0', fontSize: 16, fontWeight: '600' },
  muted: { color: '#94a3b8', fontSize: 12 },
  action: { color: '#22c55e', fontSize: 13, fontWeight: '600' },
  editInput: { backgroundColor: '#0f172a', color: '#e2e8f0', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, minWidth: 70, textAlign: 'right' },
  empty: { color: '#64748b', textAlign: 'center', marginTop: 24 },
});
