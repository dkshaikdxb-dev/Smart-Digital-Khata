import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, Alert, ScrollView, RefreshControl, ActivityIndicator,
} from 'react-native';
import { orders, isAuthError } from '../services/api';
import { useT } from '../i18n';
import { chipLabel, etaState, formatClock, DEFAULT_CHIPS } from '../lib/orderEta';
// EDIT THE ORDER WHILE ACCEPTING (batch C). Pure JS helpers — no dependency, so
// this whole feature ships over the air.
import {
  isEditable, draftFrom, decrement, removeLine, restoreLine, lineTotalFor,
  summarize, linesPayload, newRequestId, editLineText,
} from '../lib/orderEdit';

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
  // EDIT MODE (batch C). `draft` is a purely LOCAL map of order_item_id -> the
  // quantity the owner has tapped down to; nothing is sent until Confirm, so the
  // running total moves under the thumb with no round trip. `reqId` is minted
  // ONCE when edit mode opens and reused for every retry of that confirm, so a
  // dropped response on a 2G link can never take the money off twice.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [reqId, setReqId] = useState('');
  const [justEdited, setJustEdited] = useState(false);

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

  // ---- EDIT MODE (batch C): reduce an order the shop cannot fully supply ----

  function startEdit() {
    setMsg('');
    setDraft(draftFrom(order.items || []));
    setReqId(newRequestId());
    setEditing(true);
  }

  function stopEdit() {
    setEditing(false);
    setDraft({});
    setReqId('');
  }

  // Confirm the reduction. Only the lines that actually MOVED are sent, so a
  // retry after a timeout carries exactly the same body as the first attempt.
  async function confirmEdit() {
    const sum = summarize(order.items || [], draft);
    if (!sum.changed.length || sum.empty) return;
    setBusy(true); setMsg('');
    try {
      await orders.editItems(id, linesPayload(sum.changed), reqId);
      stopEdit();
      await load();
      setMsg(t('oedit.saved'));
      // "Fix it and accept" is ONE continuous action: after reducing a still-
      // pending order the accept chips are exactly where the owner is looking.
      setJustEdited(true);
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
  // EDIT MODE (batch C). `sum` recomputes on every render, so the running total
  // is live. With edit mode closed the draft is empty and it simply describes
  // the order as it stands.
  const editable = isEditable(order) && !terminal;
  const edits = order.edits || [];
  const sum = summarize(items, editing ? draft : {});
  // What the reduction does to the money, in the owner's own terms, BEFORE they
  // confirm. Phrased as an AMOUNT TAKEN OFF and never as a new grand total: the
  // delivery fee is recomputed server-side by the shop's own free-delivery rule,
  // and quoting a total the server might correct would be worse than none.
  const moneyNote = (reduction) => {
    if (!reduction) return '';
    const amount = fmt(reduction);
    if (order.payment_mode === 'credit') return t('oedit.moneyCredit', { amount });
    if (order.payment_mode === 'prepaid') return t('oedit.moneyPrepaid', { amount });
    return t('oedit.moneyCash', { amount });
  };

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
            {/* "Fix it and accept" is ONE continuous action (batch C). */}
            {justEdited ? <Text style={s.etaHint}>{t('oedit.thenAccept')}</Text> : null}
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
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Text style={s.sectionTitle}>{editing ? t('oedit.title') : t('ord.items')}</Text>
          {/* The way in. Only offered while the order can still be reduced —
              past 'accepted' the goods are being assembled and the API says 409. */}
          {editable && !editing ? (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.muted}>{t('oedit.start')}</Text>
              <Pressable style={[s.etaGhost, busy && { opacity: 0.5 }, { marginTop: 6 }]} disabled={busy} onPress={startEdit}>
                <Text style={s.etaGhostText}>{t('oedit.startBtn')}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {editing ? (
          <View>
            {/* It must be OBVIOUS that only removals are possible. This is the
                first thing in edit mode, before any control. */}
            <Text style={s.editHelp}>{t('oedit.help')}</Text>
            {items.map((it) => {
              const before = Number(it.quantity);
              const after = draft[it.id] != null ? Number(draft[it.id]) : before;
              const gone = after === 0;
              return (
                <View key={it.id} style={[s.itemRow, gone && { opacity: 0.55 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.itemName, gone && s.strike]}>{it.name}</Text>
                    <Text style={s.muted}>
                      {gone ? `${fmt(it.unit_price)} — ${t('oedit.removedTag')}` : `${fmt(it.unit_price)} × ${after}`}
                      {after !== before && !gone ? ` (${t('oedit.was', { was: before })})` : ''}
                    </Text>
                  </View>
                  {/* MINUS and REMOVE only. There is deliberately no plus, at
                      any size, anywhere on this screen. */}
                  <Pressable
                    style={[s.stepBtn, (busy || after === 0) && { opacity: 0.4 }]}
                    disabled={busy || after === 0}
                    onPress={() => setDraft(decrement(draft, it.id))}
                    accessibilityLabel={`${t('oedit.remove')} ${it.name}`}
                  >
                    <Text style={s.stepBtnText}>−</Text>
                  </Pressable>
                  <Pressable
                    style={[s.editGhost, busy && { opacity: 0.5 }]}
                    disabled={busy}
                    onPress={() => setDraft(gone ? restoreLine(draft, items, it.id) : removeLine(draft, it.id))}
                  >
                    <Text style={s.etaGhostText}>{gone ? t('oedit.restore') : t('oedit.remove')}</Text>
                  </Pressable>
                  <Text style={[s.itemTotal, { minWidth: 78, textAlign: 'right' }]}>{fmt(lineTotalFor(it, after))}</Text>
                </View>
              );
            })}

            {/* The LIVE running total, and what it means for the money. */}
            <Text style={s.editTotal}>{t('oedit.wasNow', { was: fmt(sum.wasSubtotal), now: fmt(sum.subtotal) })}</Text>
            {sum.reduction > 0 ? (
              <View>
                <Text style={s.muted}>{t('oedit.reducedBy', { amount: fmt(sum.reduction) })}</Text>
                <Text style={s.muted}>{moneyNote(sum.reduction)}</Text>
                {order.fulfillment_type === 'delivery' ? <Text style={s.muted}>{t('oedit.feeMayChange')}</Text> : null}
              </View>
            ) : null}
            {sum.empty ? <Text style={s.editWarn}>{t('oedit.cancelInstead')}</Text> : null}
            {!sum.changed.length ? <Text style={s.muted}>{t('oedit.noChange')}</Text> : null}

            <View style={s.actions}>
              <Pressable
                style={[s.primary, (busy || !sum.changed.length || sum.empty) && { opacity: 0.5 }]}
                disabled={busy || !sum.changed.length || sum.empty}
                onPress={confirmEdit}
              >
                <Text style={s.primaryText}>{busy ? t('oedit.saving') : t('oedit.confirm')}</Text>
              </Pressable>
              <Pressable style={[s.secondary, busy && { opacity: 0.5 }]} disabled={busy} onPress={stopEdit}>
                <Text style={s.secondaryText}>{t('oedit.keep')}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View>
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
            {/* An order that HAS been reduced always shows what it was, so the
                smaller number is never the only thing on the screen. */}
            {order.original_subtotal != null && Number(order.original_subtotal) !== Number(order.subtotal) ? (
              <View style={s.subtotalRow}>
                <Text style={s.muted}>{t('oedit.originalSubtotal')}</Text>
                <Text style={s.muted}>{fmt(order.original_subtotal)}</Text>
              </View>
            ) : null}
          </View>
        )}
      </View>

      {/* THE AUDIT. Once an order has been reduced this card is always here, so
          the change is never silent — who, what and when, line by line. */}
      {edits.length > 0 ? (
        <View style={s.card}>
          <Text style={s.sectionTitle}>{t('oedit.historyTitle')}</Text>
          {edits.map((e) => (
            <View key={e.id} style={s.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.body}>{editLineText(t, e)}</Text>
                <Text style={s.muted}>
                  {t('oedit.historyBy', {
                    who: e.edited_by_name || t('oedit.historyUnknownWho'),
                    when: new Date(e.created_at).toLocaleString(),
                  })}
                </Text>
              </View>
              <Text style={s.itemTotal}>−{fmt(Math.abs(Number(e.amount_delta)))}</Text>
            </View>
          ))}
        </View>
      ) : null}

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
  // Reduce-the-order controls (batch C). The minus is a big square target: it is
  // tapped one-handed, mid-rush, on a cracked screen, and a mis-tap here is
  // someone's money.
  editHelp: { color: '#94a3b8', fontSize: 13, marginBottom: 12, lineHeight: 18 },
  stepBtn: { backgroundColor: '#334155', borderRadius: 10, width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  stepBtnText: { color: '#e2e8f0', fontSize: 24, fontWeight: '800', lineHeight: 26 },
  editGhost: { backgroundColor: '#334155', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, marginLeft: 8 },
  editTotal: { color: '#e2e8f0', fontSize: 16, fontWeight: '800', marginTop: 14 },
  editWarn: { color: '#f87171', fontSize: 14, fontWeight: '700', marginTop: 8 },
  strike: { textDecorationLine: 'line-through' },
});
