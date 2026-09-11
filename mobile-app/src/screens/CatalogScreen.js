import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, StyleSheet, Pressable, Alert,
  RefreshControl, KeyboardAvoidingView, Platform, ActivityIndicator, Switch,
} from 'react-native';
import { products, catalog } from '../services/api';
import { useT } from '../i18n';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;

export default function CatalogScreen() {
  const { t, lang } = useT();

  // Top-level mode: the existing "My products" list/form, or the new
  // "Add from catalogue" browse view. My-products behaviour is untouched.
  const [mode, setMode] = useState('mine');

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

  // ---- Browse ("Add from catalogue") state ----
  const [browseSearch, setBrowseSearch] = useState('');
  const [browseItems, setBrowseItems] = useState([]);
  const [browseCursor, setBrowseCursor] = useState(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseLoadingMore, setBrowseLoadingMore] = useState(false);
  const [pricingId, setPricingId] = useState(null); // catalog item currently being priced
  const [pricingVal, setPricingVal] = useState('');
  const [addingId, setAddingId] = useState(null);

  const load = useCallback(async () => {
    const r = await products.list();
    setItems(r.items || []);
  }, []);

  useEffect(() => {
    load().catch((e) => Alert.alert(t('common.error'), e.response?.data?.error || e.message)).finally(() => setLoading(false));
  }, [load, t]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(); } catch (e) { Alert.alert(t('common.error'), e.response?.data?.error || e.message); } finally { setRefreshing(false); }
  };

  async function add() {
    if (!name.trim()) return Alert.alert(t('common.missing'), t('cat.missingName'));
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
      Alert.alert(t('common.failed'), e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item) {
    try {
      await products.update(item.id, { is_active: !item.is_active });
      await load();
    } catch (e) {
      Alert.alert(t('common.failed'), e.response?.data?.error || e.message);
    }
  }

  function confirmDelete(item) {
    Alert.alert(t('cat.deleteTitle'), t('cat.deleteConfirm', { name: item.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive', onPress: async () => {
          try { await products.remove(item.id); await load(); }
          catch (e) { Alert.alert(t('common.failed'), e.response?.data?.error || e.message); }
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
      t('cat.editPriceTitle'),
      item.name,
      async (val) => {
        if (val == null || val === '') return;
        try { await products.update(item.id, { price: Math.round(Number(val) * 100) }); await load(); }
        catch (e) { Alert.alert(t('common.failed'), e.response?.data?.error || e.message); }
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
      Alert.alert(t('common.failed'), e.response?.data?.error || e.message);
    }
  }

  // ---- Browse: fetch a page (cursor=null → fresh first page) ----
  const doBrowse = useCallback(async (cursor) => {
    if (cursor) setBrowseLoadingMore(true); else setBrowseLoading(true);
    try {
      const r = await catalog.list({ search: browseSearch.trim(), lang, cursor: cursor || '' });
      const rows = r.items || [];
      setBrowseItems((prev) => (cursor ? [...prev, ...rows] : rows));
      setBrowseCursor(r.next_cursor || null);
    } catch (e) {
      Alert.alert(t('common.error'), e.response?.data?.error || e.message);
    } finally {
      if (cursor) setBrowseLoadingMore(false); else setBrowseLoading(false);
    }
  }, [browseSearch, lang, t]);

  // Debounced auto-search: fires ~350ms after typing stops, when the browse mode
  // opens, and when the language changes — NOT on every keystroke. An empty
  // search still loads the first page of the catalogue.
  useEffect(() => {
    if (mode !== 'browse') return undefined;
    const h = setTimeout(() => { doBrowse(null); }, 350);
    return () => clearTimeout(h);
    // doBrowse is intentionally omitted; browseSearch/lang already re-key this.
  }, [mode, browseSearch, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = () => { if (browseCursor && !browseLoadingMore) doBrowse(browseCursor); };

  function startAdd(item) {
    setPricingId(item.id);
    setPricingVal(String(((Number(item.indicative_price) || 0) / 100).toFixed(2)));
  }

  async function confirmAdd(item) {
    const paise = Math.round(Number(pricingVal || 0) * 100); // integer paise
    setAddingId(item.id);
    try {
      await catalog.select(item.id, paise);
      setPricingId(null); setPricingVal('');
      // Optimistically mark the row carried, then refresh My-products so the new
      // item shows up there too.
      setBrowseItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, carried: true, shop_price: paise } : it)));
      await load();
    } catch (e) {
      Alert.alert(t('common.failed'), e.response?.data?.error || e.message);
    } finally {
      setAddingId(null);
    }
  }

  const segments = (
    <View style={s.segRow}>
      <Pressable style={[s.seg, mode === 'mine' && s.segActive]} onPress={() => setMode('mine')}>
        <Text style={[s.segText, mode === 'mine' && s.segTextActive]}>{t('cat.myProducts')}</Text>
      </Pressable>
      <Pressable style={[s.seg, mode === 'browse' && s.segActive]} onPress={() => setMode('browse')}>
        <Text style={[s.segText, mode === 'browse' && s.segTextActive]}>{t('cat.addFromCatalogue')}</Text>
      </Pressable>
    </View>
  );

  const header = (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.formCard}>
        <Text style={s.formTitle}>{t('cat.addProduct')}</Text>
        <TextInput style={s.input} placeholder={t('cat.namePlaceholder')} placeholderTextColor="#64748b" value={name} onChangeText={setName} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput style={[s.input, { flex: 1 }]} placeholder={t('cat.pricePlaceholder')} placeholderTextColor="#64748b" keyboardType="decimal-pad" value={price} onChangeText={setPrice} />
          <TextInput style={[s.input, { flex: 1 }]} placeholder={t('cat.unitPlaceholder')} placeholderTextColor="#64748b" value={unit} onChangeText={setUnit} />
        </View>
        <TextInput style={s.input} placeholder={t('cat.descPlaceholder')} placeholderTextColor="#64748b" value={description} onChangeText={setDescription} />
        <Pressable style={[s.primary, saving && { opacity: 0.6 }]} onPress={add} disabled={saving}>
          <Text style={s.primaryText}>{saving ? t('cat.adding') : `+ ${t('cat.addProduct')}`}</Text>
        </Pressable>
      </View>
      <Text style={s.sectionLabel}>{t('cat.products')}</Text>
    </KeyboardAvoidingView>
  );

  const renderMine = () => {
    if (loading) return <View style={s.center}><ActivityIndicator color="#22c55e" /></View>;
    return (
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16 }}
        data={items}
        keyExtractor={(i) => i.id}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e2e8f0" />}
        ListEmptyComponent={<Text style={s.empty}>{t('cat.empty')}</Text>}
        renderItem={({ item }) => (
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{item.name}</Text>
              <Text style={s.muted}>{fmt(item.price)} / {item.unit}{item.description ? ` · ${item.description}` : ''}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={s.muted}>{item.is_active ? t('cat.active') : t('cat.hidden')}</Text>
                <Switch value={!!item.is_active} onValueChange={() => toggleActive(item)} trackColor={{ true: '#22c55e', false: '#334155' }} thumbColor="#e2e8f0" />
              </View>
              {editing === item.id ? (
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <TextInput style={s.editInput} keyboardType="decimal-pad" value={editPriceVal} onChangeText={setEditPriceVal} autoFocus />
                  <Pressable onPress={() => saveEditPrice(item)}><Text style={s.action}>{t('common.save')}</Text></Pressable>
                  <Pressable onPress={() => { setEditing(null); setEditPriceVal(''); }}><Text style={s.muted}>{t('common.cancel')}</Text></Pressable>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => editPrice(item)}><Text style={s.action}>{t('cat.editPrice')}</Text></Pressable>
                  <Pressable onPress={() => confirmDelete(item)}><Text style={[s.action, { color: '#f87171' }]}>{t('common.delete')}</Text></Pressable>
                </View>
              )}
            </View>
          </View>
        )}
      />
    );
  };

  const renderBrowseRow = ({ item }) => {
    const nameText = item.display_name_local || item.display_name || item.product || '';
    const parts = [];
    if (item.brand) parts.push(item.brand);
    if (item.pack) parts.push(item.pack);
    parts.push(`${t('cat.indicative')} ${fmt(item.indicative_price)}`);
    return (
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{nameText}</Text>
          <Text style={s.muted}>{parts.join(' · ')}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          {item.carried ? (
            <Text style={s.addedBadge}>{t('cat.added')}</Text>
          ) : pricingId === item.id ? (
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <TextInput style={s.editInput} keyboardType="decimal-pad" value={pricingVal} onChangeText={setPricingVal} placeholder={t('cat.setPrice')} placeholderTextColor="#64748b" autoFocus />
              <Pressable onPress={() => confirmAdd(item)} disabled={addingId === item.id}>
                <Text style={s.action}>{addingId === item.id ? t('cat.adding') : t('common.save')}</Text>
              </Pressable>
              <Pressable onPress={() => { setPricingId(null); setPricingVal(''); }}><Text style={s.muted}>{t('common.cancel')}</Text></Pressable>
            </View>
          ) : (
            <Pressable style={s.addBtn} onPress={() => startAdd(item)}><Text style={s.addBtnText}>{t('cat.add')}</Text></Pressable>
          )}
        </View>
      </View>
    );
  };

  const renderBrowse = () => (
    <View style={{ flex: 1, padding: 16 }}>
      <View style={{ marginBottom: 12 }}>
        <TextInput
          style={s.input}
          placeholder={t('cat.searchCatalogue')}
          placeholderTextColor="#64748b"
          value={browseSearch}
          onChangeText={setBrowseSearch}
          onSubmitEditing={() => doBrowse(null)}
          returnKeyType="search"
          autoCorrect={false}
        />
      </View>
      <FlatList
        data={browseItems}
        keyExtractor={(i) => i.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={browseLoading
          ? <ActivityIndicator color="#22c55e" style={{ marginTop: 24 }} />
          : <Text style={s.empty}>{t('cat.noCatalogue')}</Text>}
        ListFooterComponent={browseLoadingMore
          ? <ActivityIndicator color="#22c55e" style={{ marginVertical: 14 }} />
          : (browseCursor ? (
            <Pressable style={s.loadMore} onPress={loadMore}>
              <Text style={s.action}>{t('cat.loadMore')}</Text>
            </Pressable>
          ) : null)}
        renderItem={renderBrowseRow}
      />
    </View>
  );

  return (
    <View style={s.container}>
      {segments}
      {mode === 'mine' ? renderMine() : renderBrowse()}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  center: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' },
  segRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 16 },
  seg: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: '#1e293b' },
  segActive: { backgroundColor: '#22c55e' },
  segText: { color: '#94a3b8', fontWeight: '700', fontSize: 13 },
  segTextActive: { color: '#000' },
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
  addBtn: { backgroundColor: '#22c55e', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  addBtnText: { color: '#000', fontWeight: '700', fontSize: 13 },
  addedBadge: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  loadMore: { paddingVertical: 14, alignItems: 'center' },
  editInput: { backgroundColor: '#0f172a', color: '#e2e8f0', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, minWidth: 70, textAlign: 'right' },
  empty: { color: '#64748b', textAlign: 'center', marginTop: 24 },
});
