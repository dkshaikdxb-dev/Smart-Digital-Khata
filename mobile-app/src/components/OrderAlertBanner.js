import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useT } from '../i18n';
import useOrderAlerts from '../lib/useOrderAlerts';

// Repeating new-order alert banner, OWNER NATIVE APP (batch ORDERALERT).
//
// Mounted INSIDE the owner tab navigator (App.js) as an absolutely-positioned
// overlay, so it floats over every screen and every tab — an owner adding a
// transaction still sees that an order is waiting.
//
// OTA-SAFE: react-native primitives and the already-installed navigation package
// only. No new dependency, no native module.
//
// Design for the real user: two BIG buttons ("Seen" / "Open") with large touch
// targets, high contrast, reachable one-handed at the top of the screen, and a
// small mute control that never hides the two main actions.

const fmt = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;

export default function OrderAlertBanner({ enabled = true }) {
  const { t } = useT();
  const navigation = useNavigation();
  const { oldest, items, muted, busyId, ack, mute } = useOrderAlerts({ enabled });

  if (!oldest) return null;

  const name = oldest.customer_name_local || oldest.customer_name || '';
  const mins = Math.max(0, Math.round(Number(oldest.age_seconds || 0) / 60));

  // "Open" jumps to the order's detail screen inside the Orders tab, so the
  // owner lands exactly where they can accept it.
  function open() {
    try {
      navigation.navigate('OrdersTab', { screen: 'OrderDetail', params: { id: oldest.id } });
    } catch (e) { /* navigation is best-effort; the banner stays either way */ }
  }

  return (
    <View style={s.wrap} pointerEvents="box-none">
      <View style={s.banner} accessibilityRole="alert" accessibilityLiveRegion="assertive">
        <View style={s.headRow}>
          <Text style={s.title}>{t('oalert.title')}</Text>
          {items.length > 1 ? (
            <Text style={s.more}>{t('oalert.more', { n: items.length - 1 })}</Text>
          ) : null}
        </View>
        <Text style={s.facts} numberOfLines={2}>
          {name} · {t('oalert.items', { n: Number(oldest.item_count) || 0 })} · {fmt(oldest.total)} · {t('oalert.waiting', { mins })}
        </Text>

        <View style={s.actions}>
          <Pressable
            style={[s.btn, s.seen, busyId === oldest.id && { opacity: 0.6 }]}
            onPress={() => ack(oldest.id)}
            disabled={busyId === oldest.id}
            accessibilityRole="button"
          >
            <Text style={s.seenText}>{t('oalert.seen')}</Text>
          </Pressable>
          <Pressable style={[s.btn, s.open]} onPress={open} accessibilityRole="button">
            <Text style={s.openText}>{t('oalert.open')}</Text>
          </Pressable>
        </View>

        <Pressable
          style={s.muteRow}
          onPress={() => mute(muted ? 0 : 30)}
          accessibilityRole="button"
        >
          <Text style={s.muteText}>{muted ? t('oalert.unmute') : t('oalert.mute30')}</Text>
        </Pressable>
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
  title: { color: '#fff', fontSize: 16, fontWeight: '800', flexShrink: 1 },
  more: {
    color: '#fff', fontSize: 12, fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.28)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
  },
  facts: { color: '#fff', fontSize: 14, marginTop: 4, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  // Big, one-handed targets — these are tapped mid-rush.
  btn: { flex: 1, minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  seen: { backgroundColor: '#fff' },
  seenText: { color: '#7f1d1d', fontSize: 17, fontWeight: '800' },
  open: { backgroundColor: 'rgba(0,0,0,0.30)', borderWidth: 2, borderColor: '#fff' },
  openText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  muteRow: { marginTop: 10, minHeight: 32, justifyContent: 'center' },
  muteText: { color: '#fff', fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
});
