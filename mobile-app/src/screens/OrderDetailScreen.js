import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, Alert, ScrollView, RefreshControl, ActivityIndicator,
} from 'react-native';
import { orders, isAuthError } from '../services/api';
import { useT } from '../i18n';
import { chipLabel, etaState, formatClock, DEFAULT_CHIPS } from '../lib/orderEta';

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;
const label = (s) => (s || '').replace(/_/g, ' ');
const TERMINAL = ['completed', 'cancelled'];
const OSTATUS = new Set(['pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled']);
const FUL = new Set(['delivery', 'pickup']);
const PMODE = new Set(['credit', 'prepaid', 'cash']);
const PSTATUS = new Set(['paid', 'pending', 'failed', 'not_required']);

const statusColor = (s) => {
  if (s === 'completed') return '#22c55e';
  if (s === 'cancelled') return '#f87171';
  return '#e2e8f0';
};

// Sensible forward transitions given the current status (Cancel is separate).
// A PENDING order is deliberately absent from the buttons below: accepting is
// the one decision that carries a ready-time promise with it, so it gets the
// chip block (batch B) instead of a bare "Mark accepted".
function nextStatuses(order) {
  const isPickup = order.fulfillment_type === 'pickup';
  switch (order.status) {
    case 'pending': return [];
    case 'accepted': return ['preparing'];
    case 'preparing': return ['ready'];
    case 'ready': return isPickup ? ['completed'] : ['out_for_delivery'];
    case 'out_for_delivery': return ['completed'];
    default: return [];
  }
}

export default function OrderDetailScreen({ route, navigation }) {
  const { t, lang } = useT();
  // Localize known order enums; fall back to the de-underscored raw value.
  const enumT = (prefix, set, v) => (set.has(v) ? t(`${prefix}.${v}`) : label(v));
  const { id } = route.params;
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // ONE-TAP ACCEPT + "need more time" (batch B). The chips come from the
  // platform config; DEFAULT_CHIPS stands in until it lands (and if it never does).
  const [chips, setChips] = useState(DEFAULT_CHIPS);
  const [needMore, setNeedMore] = useState(false);

  const load = useCallback(async () => {
    const r = await orders.get(id, lang);
    setOrder(r.order || r);
  }, [id, lang]);

  useEffect(() => {
    load().catch((e) => { if (!isAuthError(e)) Alert.alert(t('common.error'), e.response?.data?.error || e.message); }).finally(() => setLoading(false));
    // Live ready-time chips. A failure is silent: the built-in defaults are
    // perfectly usable, so accepting keeps working on a bad link.
    orders.etaConfig()
      .then((r) => { if (r && Array.isArray(r.chips) && r.chips.length) setChips(r.chips); })
      .catch(() => {});
  }, [load, t]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(); } catch (e) { if (!isAuthError(e)) Alert.alert(t('common.error'), e.response?.data?.error || e.message); } finally { setRefreshing(false); }
  };

  async function setStatus(status) {
    setBusy(true); setMsg('');
    try {
      await orders.setStatus(id, status);
      await load();
      setMsg(t('ord.marked', { s: enumT('ostatus', OSTATUS, status) }));
    } catch (e) {
      if (!isAuthError(e)) Alert.alert(t('common.failed'), e.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  }

  // ONE TAP: accept the order AND make the ready-time promise in a single
  // request. `minutes` null is the honest "accept without a time".
  async function accept(minutes) {
    setBusy(true); setMsg('');
    try {
      await orders.setStatus(id, 'accepted', minutes);
      await load();
      setMsg(t('ord.marked', { s: enumT('ostatus', OSTATUS, 'accepted') }));
    } catch (e) {
      if (!isAuthError(e)) Alert.alert(t('common.failed'), e.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  }

  // "NEED MORE TIME" — re-promise an order that is already accepted. Same three
  // chips, a different endpoint, and no second mode for the owner to learn.
  async function pushEta(minutes) {
    setBusy(true); setMsg('');
    try {
      await orders.setEta(id, minutes);
      setNeedMore(false);
      await load();
      setMsg(t('eta.sent'));
    } catch (e) {
      if (!isAuthError(e)) Alert.alert(t('common.failed'), e.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    Alert.alert(t('ord.cancelOrder'), t('ord.cancelConfirm'), [
      { text: t('common.keep'), style: 'cancel' },
      { text: t('ord.cancelOrder'), style: 'destructive', onPress: () => setStatus('cancelled') },
    ]);
  }

  if (loading) return <View style={s.center}><ActivityIndicator color="#22c55e" /></View>;
  if (!order) return <View style={s.center}><Text style={s.muted}>{t('ord.notFound')}</Text></View>;

  const terminal = TERMINAL.includes(order.status);
  const forwards = nextStatuses(order);
  const items = order.items || [];
  const promiseState = etaState(order);
  const promisedTime = formatClock(order.promised_at, lang);

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e2e8f0" />}
    >
      <View style={s.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{order.customer_name_local || order.customer_name || t('title.order')}</Text>
            {order.customer_phone ? <Text style={s.muted}>{order.customer_phone}</Text> : null}
            <Text style={s.muted}>{new Date(order.created_at).toLocaleString()}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.kpi}>{fmt(order.subtotal)}</Text>
            <Text style={[s.statusText, { color: statusColor(order.status) }]}>{enumT('ostatus', OSTATUS, order.status)}</Text>
          </View>
        </View>
        <View style={s.badgeRow}>
          <Text style={s.badge}>{enumT('ful', FUL, order.fulfillment_type)}</Text>
          <Text style={s.badge}>{enumT('pmode', PMODE, order.payment_mode)}</Text>
          <Text style={s.badge}>{enumT('pstatus', PSTATUS, order.payment_status)}</Text>
        </View>

        {/* ONE-TAP ACCEPT (batch B). A pending order shows the three coarse
            chips: one big tap both accepts the order and tells the customer
            when to come. "Accept without a time" stays, because an owner who
            cannot say should not be made to guess. */}
        {order.status === 'pending' && !terminal ? (
          <View style={s.etaBlock}>
            <Text style={s.etaHint}>{t('eta.pickTime')}</Text>
            <View style={s.chipRow}>
              {chips.map((m) => (
                <Pressable key={m} style={[s.etaChip, busy && { opacity: 0.5 }]} disabled={busy} onPress={() => accept(m)}>
                  <Text style={s.etaChipText}>{chipLabel(t, m)}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={[s.etaGhost, busy && { opacity: 0.5 }]} disabled={busy} onPress={() => accept(null)}>
              <Text style={s.etaGhostText}>{t('eta.noTime')}</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Once accepted, the promise in words — and the way to move it. */}
        {order.status !== 'pending' && !terminal ? (
          <View style={s.etaBlock}>
            <Text style={promiseState === 'late' ? s.etaLate : s.etaPromised}>
              {promiseState === 'none'
                ? t('eta.noPromise')
                : promiseState === 'late'
                  ? `${t('eta.late')} — ${t('eta.promisedBy', { time: promisedTime })}`
                  : t('eta.promisedBy', { time: promisedTime })}
            </Text>
            {!needMore ? (
              <Pressable style={[s.etaGhost, busy && { opacity: 0.5 }]} disabled={busy} onPress={() => setNeedMore(true)}>
                <Text style={s.etaGhostText}>{t('eta.needMore')}</Text>
              </Pressable>
            ) : (
              <View>
                <Text style={s.etaHint}>{t('eta.needMoreHelp')}</Text>
                <View style={s.chipRow}>
                  {chips.map((m) => (
                    <Pressable key={m} style={[s.etaChip, busy && { opacity: 0.5 }]} disabled={busy} onPress={() => pushEta(m)}>
                      <Text style={s.etaChipText}>{chipLabel(t, m)}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable style={s.etaGhost} onPress={() => setNeedMore(false)}>
                  <Text style={s.etaGhostText}>{t('eta.notNow')}</Text>
                </Pressable>
              </View>
            )}
          </View>
        ) : null}

        <View style={s.actions}>
          {forwards.map((st) => (
            <Pressable key={st} style={[s.primary, (busy || terminal) && { opacity: 0.5 }]} onPress={() => setStatus(st)} disabled={busy || terminal}>
              <Text style={s.primaryText}>{t('ord.mark', { s: enumT('ostatus', OSTATUS, st) })}</Text>
            </Pressable>
          ))}
          <Pressable style={[s.secondary, (busy || terminal) && { opacity: 0.5 }]} onPress={cancel} disabled={busy || terminal}>
            <Text style={s.secondaryText}>{t('ord.cancelOrder')}</Text>
          </Pressable>
        </View>
        {terminal ? <Text style={[s.muted, { marginTop: 10 }]}>{t('ord.terminal', { s: enumT('ostatus', OSTATUS, order.status) })}</Text> : null}
        {msg ? <Text style={[s.muted, { marginTop: 10 }]}>{msg}</Text> : null}
      </View>

      <View style={s.card}>
        <Text style={s.sectionTitle}>{t('ord.items')}</Text>
        {items.length === 0 ? (
          <Text style={s.muted}>{t('ord.noItems')}</Text>
        ) : items.map((it) => (
          <View key={it.id} style={s.itemRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.itemName}>{it.name}</Text>
              <Text style={s.muted}>{fmt(it.unit_price)} × {it.quantity}</Text>
            </View>
            <Text style={s.itemTotal}>{fmt(it.line_total)}</Text>
          </View>
        ))}
        <View style={s.subtotalRow}>
          <Text style={s.muted}>{t('ord.subtotal')}</Text>
          <Text style={s.itemTotal}>{fmt(order.subtotal)}</Text>
        </View>
      </View>

      {(order.address || order.note) ? (
        <View style={s.card}>
          <Text style={s.sectionTitle}>{t('ord.delivery')}</Text>
          {order.address ? (<><Text style={s.muted}>{t('ord.address')}</Text><Text style={s.body}>{order.address}</Text></>) : null}
          {order.note ? (<><Text style={[s.muted, { marginTop: 8 }]}>{t('ord.note')}</Text><Text style={s.body}>{order.note}</Text></>) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  center: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#1e293b', padding: 16, borderRadius: 12, marginBottom: 12 },
  title: { color: '#e2e8f0', fontSize: 20, fontWeight: '700' },
  muted: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  body: { color: '#e2e8f0', fontSize: 14, marginTop: 2 },
  kpi: { color: '#e2e8f0', fontSize: 22, fontWeight: '800' },
  statusText: { fontSize: 14, fontWeight: '700', marginTop: 4, textTransform: 'capitalize' },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' },
  badge: { color: '#94a3b8', fontSize: 11, backgroundColor: '#0f172a', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, textTransform: 'capitalize' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap' },
  primary: { backgroundColor: '#22c55e', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10 },
  primaryText: { color: '#000', fontWeight: '700', textTransform: 'capitalize' },
  secondary: { backgroundColor: '#334155', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10 },
  secondaryText: { color: '#e2e8f0', fontWeight: '600' },
  sectionTitle: { color: '#e2e8f0', fontSize: 16, fontWeight: '700', marginBottom: 10 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#0f172a' },
  itemName: { color: '#e2e8f0', fontSize: 14, fontWeight: '600' },
  itemTotal: { color: '#e2e8f0', fontSize: 14, fontWeight: '700' },
  subtotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  // Ready-time promise + one-tap accept (batch B). Touch targets are deliberately
  // large: this is used one-handed, mid-rush, often on a cracked screen.
  etaBlock: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#0f172a', paddingTop: 14 },
  etaHint: { color: '#94a3b8', fontSize: 13, marginBottom: 10 },
  etaPromised: { color: '#22c55e', fontSize: 14, fontWeight: '700', marginBottom: 10 },
  etaLate: { color: '#f87171', fontSize: 14, fontWeight: '700', marginBottom: 10 },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 },
  etaChip: { backgroundColor: '#22c55e', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 14 },
  etaChipText: { color: '#000', fontWeight: '800', fontSize: 15 },
  etaGhost: { backgroundColor: '#334155', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, alignSelf: 'flex-start' },
  etaGhostText: { color: '#e2e8f0', fontWeight: '600', fontSize: 14 },
});
