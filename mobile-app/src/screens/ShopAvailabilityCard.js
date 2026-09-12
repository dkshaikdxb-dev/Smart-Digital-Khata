import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Switch } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { shop, isAuthError } from '../services/api';
import { useT } from '../i18n';
import { availabilityLine, isOpen } from '../lib/shopOpen';

// Shop availability (batch A) — the owner's HOME control on the native app, the
// mirror of the web console's card. "Are we open?" is the most time-critical
// switch a shopkeeper touches, so it sits at the top of Home with big targets:
// one switch, the state in plain words, and three one-tap pause chips
// (30 min / 1 hour / Rest of today) plus "Resume now" while paused.
//
// Every word comes from the server's `availability` object — the SAME one the
// consumer app and both web surfaces render — so the owner is never told
// something different from what a shopper sees. The daily hours and the
// festival closures live in Settings; this card is only about right now.
//
// OTA-SAFE: react-native + @react-navigation/native + the existing api/i18n
// modules only. No new dependency.
export default function ShopAvailabilityCard() {
  const { t, lang } = useT();
  const [data, setData] = useState(null); // { shop, closures }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const r = await shop.me();
    setData({ shop: r.shop, closures: r.closures || [] });
  }, []);

  // Refetch whenever Home regains focus, so a pause set in Settings (or on the
  // web console, or that simply expired) is reflected the moment you come back.
  useFocusEffect(
    useCallback(() => {
      load().catch(() => setData(null));
    }, [load])
  );

  // Staff/permission trouble or a cold network: render nothing rather than
  // break Home.
  if (!data || !data.shop) return null;

  const availability = data.shop.availability;
  const open = isOpen(availability);
  // When today is a holiday the closures list starts with TODAY's entry, so the
  // card can say "Closed today (Diwali)" instead of a bare "closed".
  const todayReason = availability && availability.reason === 'holiday' && data.closures[0]
    ? data.closures[0].reason
    : null;
  const line = open ? '' : availabilityLine(t, availability, lang, { reason: todayReason });
  const paused = !open && availability && availability.reason === 'paused';

  async function toggleOpen(next) {
    setBusy(true);
    setErr('');
    try {
      const r = await shop.update({ is_open: next });
      setData((d) => ({ ...d, shop: r.shop }));
    } catch (e) {
      if (!isAuthError(e)) setErr(e.response?.data?.error || e.message);
    } finally { setBusy(false); }
  }

  // One tap = one call. 30, 60, 'today' (resolved in the SHOP's timezone
  // server-side) or 0 to resume now.
  async function pause(minutes) {
    setBusy(true);
    setErr('');
    try {
      const r = await shop.pause(minutes);
      setData((d) => ({
        ...d,
        shop: { ...d.shop, paused_until: r.paused_until, availability: r.availability },
      }));
    } catch (e) {
      if (!isAuthError(e)) setErr(e.response?.data?.error || e.message);
    } finally { setBusy(false); }
  }

  return (
    <View style={[s.card, open ? s.cardOpen : s.cardClosed]}>
      <View style={s.headRow}>
        <Text style={s.h}>{t('open.title')}</Text>
        <View style={[s.pill, open ? s.pillOpen : s.pillClosed]}>
          <Text style={s.pillText}>{open ? t('open.open') : t('open.closed')}</Text>
        </View>
      </View>

      <View style={s.switchRow}>
        <Text style={s.switchLabel}>{t('open.switchLabel')}</Text>
        <Switch
          value={data.shop.is_open !== false}
          disabled={busy}
          onValueChange={toggleOpen}
          trackColor={{ true: '#22c55e', false: '#334155' }}
          thumbColor="#e2e8f0"
        />
      </View>

      {/* Never a bare "Closed": the reason and the reopen time, always. */}
      <Text style={s.state}>{open ? t('open.takingOrders') : line || t('open.notTakingOrders')}</Text>

      <Text style={s.help}>{t('open.pauseHelp')}</Text>
      <View style={s.chips}>
        <Chip label={t('open.pause30')} onPress={() => pause(30)} disabled={busy} />
        <Chip label={t('open.pause60')} onPress={() => pause(60)} disabled={busy} />
        <Chip label={t('open.pauseToday')} onPress={() => pause('today')} disabled={busy} />
        {paused ? <Chip label={t('open.resume')} onPress={() => pause(0)} disabled={busy} primary /> : null}
      </View>

      {err ? <Text style={s.err}>{err}</Text> : null}
    </View>
  );
}

// A big, thumb-sized chip — 48px minimum so it is tappable on a cracked screen
// in a busy shop.
function Chip({ label, onPress, disabled, primary }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[s.chip, primary && s.chipPrimary, disabled && s.chipDisabled]}
    >
      <Text style={[s.chipText, primary && s.chipTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#1e293b', padding: 16, borderRadius: 12, marginBottom: 12, borderLeftWidth: 6 },
  cardOpen: { borderLeftColor: '#22c55e' },
  cardClosed: { borderLeftColor: '#f87171' },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h: { color: '#e2e8f0', fontSize: 17, fontWeight: '700' },
  pill: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 5 },
  pillOpen: { backgroundColor: '#22c55e' },
  pillClosed: { backgroundColor: '#b91c1c' },
  pillText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  switchLabel: { color: '#e2e8f0', fontSize: 15, fontWeight: '600', flex: 1, paddingRight: 12 },
  state: { color: '#cbd5e1', fontSize: 14, marginTop: 10, lineHeight: 20 },
  help: { color: '#94a3b8', fontSize: 13, marginTop: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: {
    backgroundColor: '#334155', borderRadius: 10, paddingHorizontal: 18,
    minHeight: 48, alignItems: 'center', justifyContent: 'center',
  },
  chipPrimary: { backgroundColor: '#22c55e' },
  chipDisabled: { opacity: 0.6 },
  chipText: { color: '#e2e8f0', fontWeight: '700', fontSize: 15 },
  chipTextPrimary: { color: '#000' },
  err: { color: '#f87171', fontSize: 13, marginTop: 10 },
});
