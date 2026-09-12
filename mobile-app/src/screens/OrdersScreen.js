import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, Pressable, Alert, RefreshControl, ActivityIndicator,
} from 'react-native';
import { orders, isAuthError } from '../services/api';
import { useT } from '../i18n';
import { chipLabel, etaState, formatClock, DEFAULT_CHIPS } from '../lib/orderEta';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;
const label = (s) => (s || '').replace(/_/g, ' ');
const FILTERS = ['all', 'pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'];
const OSTATUS = new Set(['pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled']);
const FUL = new Set(['delivery', 'pickup']);
const PMODE = new Set(['credit', 'prepaid', 'cash']);
const PSTATUS = new Set(['paid', 'pending', 'failed', 'not_required']);

const statusColor = (s) => {
  if (s === 'completed') return '#22c55e';
  if (s === 'cancelled') return '#f87171';
  return '#e2e8f0';
};

export default function OrdersScreen({ navigation }) {
  const { t, lang } = useT();
  // Localize known order enums; fall back to the de-underscored raw value for any
  // value not in the set, so a label is never blank.
  const enumT = (prefix, set, v) => (set.has(v) ? t(`${prefix}.${v}`) : label(v));
  const filterLabel = (f) => (f === 'all' ? t('ofilter.all') : enumT('ostatus', OSTATUS, f));
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // ONE-TAP ACCEPT (batch B). The chips come from the platform config, so an
  // admin can change the vocabulary without shipping the app; DEFAULT_CHIPS
  // stands in until the config lands (and if it never does).
  const [chips, setChips] = useState(DEFAULT_CHIPS);
  // The one pending row whose chips are open, and the row being submitted.
  // A row at a time: the point is one tap, not a screen full of buttons.
  const [openAccept, setOpenAccept] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async (st) => {
    const r = await orders.list(st, lang);
    setItems(r.items || []);
  }, [lang]);

  useEffect(() => {
    load('all').catch((e) => { if (!isAuthError(e)) Alert.alert(t('common.error'), e.response?.data?.error || e.message); }).finally(() => setLoading(false));
    // Live ready-time chips. A failure is silent on purpose: the built-in
    // defaults are perfectly usable, so accepting keeps working on a bad link.
    orders.etaConfig()
      .then((r) => { if (r && Array.isArray(r.chips) && r.chips.length) setChips(r.chips); })
      .catch(() => {});
  }, [load, t]);

  // ONE TAP: accept the order AND make the ready-time promise in a single
  // request. `minutes` null is the honest "accept without a time".
  async function accept(o, minutes) {
    setBusyId(o.id);
    try {
      await orders.setStatus(o.id, 'accepted', minutes);
      setOpenAccept(null);
      await load(status);
    } catch (e) {
      if (!isAuthError(e)) Alert.alert(t('common.failed'), e.response?.data?.error || e.message);
    } finally {
      setBusyId(null);
    }
  }

  // Reload when returning from detail (status may have changed).
  useEffect(() => navigation.addListener('focus', () => { load(status).catch(() => {}); }), [navigation, load, status]);

  function pick(st) {
    setStatus(st);
    load(st).catch((e) => { if (!isAuthError(e)) Alert.alert(t('common.error'), e.response?.data?.error || e.message); });
  }

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(status); } catch (e) { if (!isAuthError(e)) Alert.alert(t('common.error'), e.response?.data?.error || e.message); } finally { setRefreshing(false); }
  };

  return (
    <View style={s.container}>
      <View style={s.filterWrap}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={FILTERS}
          keyExtractor={(f) => f}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 12 }}
          renderItem={({ item: f }) => (
            <Pressable onPress={() => pick(f)} style={[s.chip, status === f && s.chipActive]}>
              <Text style={[s.chipText, status === f && s.chipTextActive]}>{filterLabel(f)}</Text>
            </Pressable>
          )}
        />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color="#22c55e" /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, paddingTop: 4 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e2e8f0" />}
          ListEmptyComponent={<Text style={s.empty}>{t('ord.empty')}</Text>}
          renderItem={({ item }) => (
            <View>
            <Pressable style={s.row} onPress={() => navigation.navigate('OrderDetail', { id: item.id })}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{item.customer_name_local || item.customer_name || '—'}</Text>
                <Text style={s.muted}>{new Date(item.created_at).toLocaleString()}</Text>
                <View style={s.badgeRow}>
                  <Text style={s.badge}>{enumT('ful', FUL, item.fulfillment_type)}</Text>
                  <Text style={s.badge}>{enumT('pmode', PMODE, item.payment_mode)}</Text>
                  <Text style={s.badge}>{enumT('pstatus', PSTATUS, item.payment_status)}</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.total}>{fmt(item.subtotal)}</Text>
                <Text style={[s.statusText, { color: statusColor(item.status) }]}>{enumT('ostatus', OSTATUS, item.status)}</Text>
                {/* The promise the owner made, right next to the status it
                    belongs to. A passed promise is flagged for the OWNER — they
                    can still fix it with "Need more time" on the detail screen. */}
                {etaState(item) === 'promised' ? (
                  <Text style={s.etaText}>{t('eta.readyBy', { time: formatClock(item.promised_at, lang) })}</Text>
                ) : null}
                {etaState(item) === 'late' ? (
                  <Text style={s.etaLate}>{t('eta.late')}</Text>
                ) : null}
              </View>
            </Pressable>
            {/* ONE-TAP ACCEPT (batch B). A PENDING row gets an inline Accept that
                reveals the three coarse chips; tapping one accepts the order and
                promises the time in a single request. Big touch targets, no
                typing, and an honest escape for an owner who cannot say. */}
            {item.status === 'pending' ? (
              openAccept !== item.id ? (
                <Pressable style={[s.acceptBtn, busyId === item.id && { opacity: 0.5 }]}
                  disabled={busyId === item.id} onPress={() => setOpenAccept(item.id)}>
                  <Text style={s.acceptBtnText}>{t('eta.accept')}</Text>
                </Pressable>
              ) : (
                <View style={s.acceptPanel}>
                  <Text style={s.acceptHint}>{t('eta.pickTime')}</Text>
                  <View style={s.chipRow}>
                    {chips.map((m) => (
                      <Pressable key={m} style={[s.etaChip, busyId === item.id && { opacity: 0.5 }]}
                        disabled={busyId === item.id} onPress={() => accept(item, m)}>
                        <Text style={s.etaChipText}>{chipLabel(t, m)}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={s.chipRow}>
                    <Pressable style={[s.etaGhost, busyId === item.id && { opacity: 0.5 }]}
                      disabled={busyId === item.id} onPress={() => accept(item, null)}>
                      <Text style={s.etaGhostText}>{t('eta.noTime')}</Text>
                    </Pressable>
                    <Pressable style={s.etaGhost} onPress={() => setOpenAccept(null)}>
                      <Text style={s.etaGhostText}>{t('eta.notNow')}</Text>
                    </Pressable>
                  </View>
                </View>
              )
            ) : null}
            </View>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  filterWrap: { borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  chip: { backgroundColor: '#1e293b', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  chipActive: { backgroundColor: '#22c55e' },
  chipText: { color: '#94a3b8', textTransform: 'capitalize' },
  chipTextActive: { color: '#000', fontWeight: '700' },
  row: { backgroundColor: '#1e293b', padding: 14, borderRadius: 10, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  name: { color: '#e2e8f0', fontSize: 16, fontWeight: '600' },
  muted: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  badge: { color: '#94a3b8', fontSize: 11, backgroundColor: '#0f172a', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, textTransform: 'capitalize' },
  total: { color: '#e2e8f0', fontSize: 16, fontWeight: '700' },
  statusText: { fontSize: 13, fontWeight: '700', marginTop: 6, textTransform: 'capitalize' },
  empty: { color: '#64748b', textAlign: 'center', marginTop: 24 },
  // Ready-time promise + one-tap accept (batch B). Touch targets are deliberately
  // large: this is used one-handed, mid-rush, often on a cracked screen.
  etaText: { color: '#22c55e', fontSize: 12, fontWeight: '700', marginTop: 4 },
  etaLate: { color: '#f87171', fontSize: 12, fontWeight: '700', marginTop: 4 },
  acceptBtn: { backgroundColor: '#22c55e', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: -4, marginBottom: 12 },
  acceptBtnText: { color: '#000', fontWeight: '800', fontSize: 16 },
  acceptPanel: { backgroundColor: '#1e293b', borderRadius: 10, padding: 12, marginTop: -4, marginBottom: 12 },
  acceptHint: { color: '#94a3b8', fontSize: 13, marginBottom: 10 },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 6 },
  etaChip: { backgroundColor: '#22c55e', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 14 },
  etaChipText: { color: '#000', fontWeight: '800', fontSize: 15 },
  etaGhost: { backgroundColor: '#334155', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  etaGhostText: { color: '#e2e8f0', fontWeight: '600', fontSize: 13 },
});
