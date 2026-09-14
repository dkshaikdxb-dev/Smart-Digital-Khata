import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useT } from '../i18n';
import useOrderAlerts, { isSnoozed } from '../lib/useOrderAlerts';
import { chipLabel, DEFAULT_CHIPS } from '../lib/orderEta';
import { orders } from '../services/api';

// Repeating new-order alert banner, OWNER NATIVE APP (batch ORDERALERT,
// rewritten by batch ALERT2).
//
// Mounted INSIDE the owner tab navigator (App.js) as an absolutely-positioned
// overlay, so it floats over every screen and every tab — an owner adding a
// transaction still sees that an order is waiting.
//
// OTA-SAFE: react-native primitives and the already-installed navigation package
// only. No new dependency, no native module, no new asset.
//
// THE BANNER NOW ASKS FOR A DECISION, because only a decision answers the
// customer and only a decision ends the alert:
//
//   ACCEPT  reveals the batch-B ready-time chips, so one tap both accepts the
//           order and promises a time;
//   REJECT  asks for a short reason (three one-tap presets plus free text) and
//           cancels the order;
//   OPEN    jumps to the order's detail screen.
//
// "Not now" is still here, honestly labelled as the SNOOZE it now is. While the
// quiet window runs the alarm collapses to a slim strip that says how much
// longer it lasts — the order is undecided, so it never vanishes altogether —
// and when the window lapses the full banner returns saying it is STILL waiting.
//
// Design for the real user: BIG buttons with large touch targets, high contrast,
// reachable one-handed at the top of the screen, and the small mute control
// never hides the main actions.

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;

// The three one-tap reject reasons, in the order a kirana owner needs them.
// Free text sits underneath for everything else; a reason is offered, never
// demanded, so "Reject order" with the box empty is a legitimate answer.
const REASON_KEYS = ['orej.r1', 'orej.r2', 'orej.r3'];

export default function OrderAlertBanner({ enabled = true }) {
  const { t } = useT();
  const navigation = useNavigation();
  const {
    oldest, items, waiting, quietMinsLeft, snoozeMinutes, now,
    muted, busyId, ack, accept, reject, mute, speaking, stopSpeaking,
  } = useOrderAlerts({ enabled });

  // Which panel is open: null | 'accept' | 'reject', plus the typed reason.
  const [panel, setPanel] = useState(null);
  const [reason, setReason] = useState('');
  // The live ready-time chips. A failure is silent on purpose: DEFAULT_CHIPS is
  // perfectly usable, so accepting keeps working on a bad link.
  const [chips, setChips] = useState(DEFAULT_CHIPS);

  useEffect(() => {
    let alive = true;
    orders.etaConfig()
      .then((r) => { if (alive && r && Array.isArray(r.chips) && r.chips.length) setChips(r.chips); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // A panel belongs to ONE order. When the banner moves on (accepted, rejected,
  // snoozed, or a new oldest arrives) the panel closes, so a half-typed reason
  // can never be submitted against a different order than it was written for.
  const oldestId = oldest ? oldest.id : null;
  useEffect(() => { setPanel(null); setReason(''); }, [oldestId]);

  // "Open" jumps to the order's detail screen inside the Orders tab, so the
  // owner lands exactly where they can decide.
  function open(id) {
    try {
      navigation.navigate('OrdersTab', { screen: 'OrderDetail', params: { id } });
    } catch (e) { /* navigation is best-effort; the banner stays either way */ }
  }

  // Nothing pending at all — the app looks exactly as it did before this feature.
  if (!items.length) return null;

  // Everything pending is inside its quiet window. The alarm stands down, but a
  // slim honest strip stays: these orders are still undecided, and it says how
  // much longer the quiet lasts.
  if (!oldest) {
    return (
      <View style={s.wrap} pointerEvents="box-none">
        <View style={s.quiet} accessibilityRole="summary">
          <Text style={s.quietText} numberOfLines={2}>
            {t('oalert.title')} · {t('oalert.more', { n: items.length })} · {t('oalert.snoozedFor', { mins: quietMinsLeft })}
          </Text>
          <Pressable style={s.quietBtn} onPress={() => open(items[0].id)} accessibilityRole="button">
            <Text style={s.quietBtnText}>{t('oalert.open')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const name = oldest.customer_name_local || oldest.customer_name || '';
  const mins = Math.max(0, Math.round(Number(oldest.age_seconds || 0) / 60));
  const busy = busyId === oldest.id;
  // This order HAS been snoozed and the window has since lapsed. Say so plainly:
  // the whole point of the change is that a snooze ends and the order is still
  // sitting there unanswered.
  const returned = Boolean(oldest.snoozed_until) && !isSnoozed(oldest, now);

  return (
    <View style={s.wrap} pointerEvents="box-none">
      <View style={s.banner} accessibilityRole="alert" accessibilityLiveRegion="assertive">
        <View style={s.headRow}>
          <Text style={s.title}>{t('oalert.title')}</Text>
          {waiting.length > 1 ? (
            <Text style={s.more}>{t('oalert.more', { n: waiting.length - 1 })}</Text>
          ) : null}
          {/* Only while it is actually talking. Muting stops the NEXT repeat;
              this stops the sentence playing right now, which is the one the
              owner is standing there listening to. It deliberately does not
              mute or acknowledge anything — silencing a phone is not the same
              as answering a customer, and the alert must still be decided. */}
          {speaking ? (
            <Pressable
              onPress={stopSpeaking}
              style={s.hushBtn}
              accessibilityRole="button"
              accessibilityLabel={t('common.stop')}
            >
              <Text style={s.hushText}>⏹ {t('common.stop')}</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={s.facts} numberOfLines={2}>
          {name} · {t('oalert.items', { n: Number(oldest.item_count) || 0 })} · {fmt(oldest.total)} · {t('oalert.waiting', { mins })}
        </Text>
        {returned ? <Text style={s.stillWaiting}>{t('oalert.stillWaiting')}</Text> : null}
        {panel === null ? <Text style={s.hint}>{t('oalert.decide')}</Text> : null}

        {/* THE DECISION. Accept and Reject sit side by side at the same size:
            an order the shop cannot serve must be as easy to answer as one it
            can. Both END the alert; nothing else does. */}
        {panel === null ? (
          <View style={s.actions}>
            <Pressable
              style={[s.btn, s.accept, busy && { opacity: 0.6 }]}
              onPress={() => setPanel('accept')}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text style={s.acceptText}>{t('oalert.accept')}</Text>
            </Pressable>
            <Pressable
              style={[s.btn, s.reject, busy && { opacity: 0.6 }]}
              onPress={() => setPanel('reject')}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text style={s.rejectText}>{t('orej.reject')}</Text>
            </Pressable>
            <Pressable style={[s.btn, s.open]} onPress={() => open(oldest.id)} accessibilityRole="button">
              <Text style={s.openText}>{t('oalert.open')}</Text>
            </Pressable>
          </View>
        ) : null}

        {panel === 'accept' ? (
          <View style={s.panel}>
            <Text style={s.hint}>{t('eta.pickTime')}</Text>
            <View style={s.chipRow}>
              {chips.map((m) => (
                <Pressable
                  key={m}
                  style={[s.chip, busy && { opacity: 0.6 }]}
                  disabled={busy}
                  onPress={() => accept(oldest.id, m)}
                  accessibilityRole="button"
                >
                  <Text style={s.chipText}>{chipLabel(t, m)}</Text>
                </Pressable>
              ))}
            </View>
            <View style={s.chipRow}>
              <Pressable
                style={[s.ghost, busy && { opacity: 0.6 }]}
                disabled={busy}
                onPress={() => accept(oldest.id, null)}
                accessibilityRole="button"
              >
                <Text style={s.ghostText}>{t('eta.noTime')}</Text>
              </Pressable>
              <Pressable style={s.ghost} onPress={() => setPanel(null)} accessibilityRole="button">
                <Text style={s.ghostText}>{t('orej.back')}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {panel === 'reject' ? (
          <View style={s.panel}>
            <Text style={s.hint}>{t('orej.help')}</Text>
            {/* A PAID PREPAID order is never refunded — the money becomes credit
                at this shop. The owner is told BEFORE they tap, not after. */}
            {oldest.payment_mode === 'prepaid' ? (
              <Text style={s.hint}>{t('orej.prepaidCredit')}</Text>
            ) : null}
            <View style={s.chipRow}>
              {REASON_KEYS.map((k) => (
                <Pressable
                  key={k}
                  style={[s.chip, busy && { opacity: 0.6 }]}
                  disabled={busy}
                  onPress={() => reject(oldest.id, t(k))}
                  accessibilityRole="button"
                >
                  <Text style={s.chipText}>{t(k)}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={s.input}
              value={reason}
              onChangeText={setReason}
              maxLength={200}
              placeholder={t('orej.placeholder')}
              placeholderTextColor="#fca5a5"
            />
            <View style={s.chipRow}>
              <Pressable
                style={[s.chip, busy && { opacity: 0.6 }]}
                disabled={busy}
                onPress={() => reject(oldest.id, reason)}
                accessibilityRole="button"
              >
                <Text style={s.chipText}>{t('orej.confirm')}</Text>
              </Pressable>
              <Pressable style={s.ghost} onPress={() => { setPanel(null); setReason(''); }} accessibilityRole="button">
                <Text style={s.ghostText}>{t('orej.back')}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={s.minorRow}>
          <Pressable
            style={s.minorBtn}
            onPress={() => ack(oldest.id)}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={s.minorText}>{t('oalert.snooze', { mins: snoozeMinutes })}</Text>
          </Pressable>
          <Pressable style={s.minorBtn} onPress={() => mute(muted ? 0 : 30)} accessibilityRole="button">
            <Text style={s.minorText}>{muted ? t('oalert.unmute') : t('oalert.mute30')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  // Floats over the tab navigator. `box-none` on the wrapper lets taps pass
  // through everywhere except the banner itself.
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50, elevation: 12 },
  banner: {
    backgroundColor: '#b91c1c',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#fecaca',
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Pushed to the far end of the head row so it never crowds the title, and
  // given a real tap target: this gets jabbed at in a hurry, often one-handed,
  // by someone who wants the phone to shut up now.
  hushBtn: {
    marginLeft: 'auto',
    backgroundColor: '#475569',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    minHeight: 44,
    justifyContent: 'center',
  },
  hushText: { color: '#f8fafc', fontWeight: '700', fontSize: 14 },
  title: { color: '#fff', fontSize: 16, fontWeight: '800', flexShrink: 1 },
  more: {
    color: '#fff', fontSize: 12, fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.28)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
  },
  facts: { color: '#fff', fontSize: 14, marginTop: 4, lineHeight: 19 },
  stillWaiting: { color: '#fff', fontSize: 13, fontWeight: '800', marginTop: 4, lineHeight: 18 },
  hint: { color: '#fee2e2', fontSize: 13, marginTop: 6, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  // Big, one-handed targets — these are tapped mid-rush.
  btn: { flex: 1, minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  accept: { backgroundColor: '#fff' },
  acceptText: { color: '#7f1d1d', fontSize: 17, fontWeight: '800' },
  // Outlined, so it can never be hit by muscle memory aiming for Accept.
  reject: { backgroundColor: 'rgba(0,0,0,0.30)', borderWidth: 2, borderColor: '#fecaca' },
  rejectText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  open: { backgroundColor: 'rgba(0,0,0,0.30)', borderWidth: 2, borderColor: '#fff' },
  openText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  panel: { marginTop: 10 },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 8 },
  chip: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, minHeight: 48, justifyContent: 'center' },
  chipText: { color: '#7f1d1d', fontSize: 15, fontWeight: '800' },
  ghost: { backgroundColor: 'rgba(0,0,0,0.30)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  ghostText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  input: {
    marginTop: 8, minHeight: 48, borderRadius: 10, borderWidth: 2, borderColor: '#fecaca',
    paddingHorizontal: 12, paddingVertical: 10, color: '#fff', fontSize: 15,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  minorRow: { flexDirection: 'row', gap: 18, marginTop: 10, flexWrap: 'wrap' },
  minorBtn: { minHeight: 32, justifyContent: 'center' },
  minorText: { color: '#fff', fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  // The SNOOZE strip: every pending order is inside its quiet window. Not an
  // alarm, but never invisible either — nobody has answered these customers yet.
  quiet: {
    backgroundColor: '#7f1d1d',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(254,202,202,0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  quietText: { color: '#fff', fontSize: 13, flex: 1, lineHeight: 18 },
  quietBtn: {
    minHeight: 40, borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  quietBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
