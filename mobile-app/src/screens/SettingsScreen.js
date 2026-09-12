import React, { useEffect, useState, useCallback, useContext } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable, Alert, ScrollView,
  ActivityIndicator, Switch, KeyboardAvoidingView, Platform,
} from 'react-native';
import { shop, orders, isAuthError } from '../services/api';
import { AuthContext } from '../AuthContext';
import { useT, LANGUAGES, isBetaLang } from '../i18n';

const NOTIF_MODES = [
  { value: 'silent', tkey: 'setn.silent' },
  { value: 'smart', tkey: 'setn.smart' },
  { value: 'active', tkey: 'setn.active' },
];

export default function SettingsScreen() {
  const { t, lang, setLang } = useT();
  const { signOut } = useContext(AuthContext);
  const [form, setForm] = useState(null);
  const [pay, setPay] = useState(null);
  const [payForm, setPayForm] = useState({ razorpay_key_id: '', razorpay_key_secret: '', razorpay_webhook_secret: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // Shop availability (batch A): the daily hours + the festival closures. The
  // right-now switch and the pause chips live on HOME (ShopAvailabilityCard),
  // where a shopkeeper in a rush can reach them; this is the set-once half.
  // Hours are edited as plain 'HH:MM' text — no date-picker dependency, which
  // keeps the app over-the-air updatable.
  const [closures, setClosures] = useState([]);
  const [hours, setHours] = useState({ open: '', close: '' });
  const [closureDraft, setClosureDraft] = useState({ date: '', reason: '' });

  const loadPayment = useCallback(async () => {
    const p = await shop.payment();
    setPay(p);
    setPayForm({ razorpay_key_id: p.key_id || '', razorpay_key_secret: '', razorpay_webhook_secret: '' });
  }, []);

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([shop.me(), shop.payment()]);
    setForm(s.shop);
    // Availability (batch A): the stored TIME arrives as 'HH:MM:SS'; the inputs
    // hold 'HH:MM'. The closures list is already scoped to the next 90 days.
    setHours({
      open: s.shop.open_time ? String(s.shop.open_time).slice(0, 5) : '',
      close: s.shop.close_time ? String(s.shop.close_time).slice(0, 5) : '',
    });
    setClosures(s.closures || []);
    setPay(p);
    setPayForm({ razorpay_key_id: p.key_id || '', razorpay_key_secret: '', razorpay_webhook_secret: '' });
  }, []);

  // Run the initial load, tracking a load-failed flag so a failure renders a
  // retry view instead of trapping the screen on an endless spinner (form stays
  // null on error). Skip the alert on a handled 401 — the app already routed to
  // Login.
  const runLoad = useCallback(() => {
    setLoading(true);
    load()
      .catch((e) => {
        if (!isAuthError(e)) Alert.alert(t('common.error'), e.response?.data?.error || e.message);
      })
      .finally(() => setLoading(false));
  }, [load, t]);

  useEffect(() => { runLoad(); }, [runLoad]);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function saveBasics() {
    setBusy(true);
    try {
      const r = await shop.update({ name: form.name, notification_mode: form.notification_mode });
      setForm(r.shop);
      Alert.alert(t('set.savedTitle'), t('set.shopSaved'));
    } catch (e) { if (!isAuthError(e)) Alert.alert(t('common.failed'), e.response?.data?.error || e.message); }
    finally { setBusy(false); }
  }

  async function savePayment() {
    setBusy(true);
    const body = { razorpay_key_id: payForm.razorpay_key_id };
    if (payForm.razorpay_key_secret) body.razorpay_key_secret = payForm.razorpay_key_secret;
    if (payForm.razorpay_webhook_secret) body.razorpay_webhook_secret = payForm.razorpay_webhook_secret;
    try {
      await shop.updatePayment(body);
      await loadPayment();
      Alert.alert(t('set.savedTitle'), t('set.paymentSaved'));
    } catch (e) { if (!isAuthError(e)) Alert.alert(t('common.failed'), e.response?.data?.error || e.message); }
    finally { setBusy(false); }
  }

  async function testPayment() {
    setBusy(true);
    try {
      const r = await shop.testPayment();
      Alert.alert(
        r.ok ? t('set.connOkTitle') : t('set.connFailedTitle'),
        r.message || (r.ok ? t('set.connOkMsg') : t('set.connFailedMsg')),
      );
    } catch (e) { if (!isAuthError(e)) Alert.alert(t('set.connFailedTitle'), e.response?.data?.error || e.message); }
    finally { setBusy(false); }
  }

  // Repeating new-order alert (batch ORDERALERT). The interval and the repeat
  // count are CLAMPED server-side to the live platform bounds, so we save what
  // the owner typed, show what actually came back, and say plainly when the two
  // differ instead of silently changing the number under them.
  async function saveOrderAlerts() {
    setBusy(true);
    const wanted = {
      order_alert_enabled: form.order_alert_enabled !== false,
      order_alert_repeat_minutes: parseInt(form.order_alert_repeat_minutes, 10) || 5,
      order_alert_max_repeats: parseInt(form.order_alert_max_repeats, 10) || 0,
    };
    try {
      const r = await shop.update(wanted);
      setForm(r.shop);
      const clamped = Number(r.shop.order_alert_repeat_minutes) !== wanted.order_alert_repeat_minutes
        || Number(r.shop.order_alert_max_repeats) !== wanted.order_alert_max_repeats;
      Alert.alert(t('set.savedTitle'), clamped ? t('oalert.setClamped') : t('oalert.setSaved'));
    } catch (e) { if (!isAuthError(e)) Alert.alert(t('common.failed'), e.response?.data?.error || e.message); }
    finally { setBusy(false); }
  }

  // "Quiet for a while" — the SAME endpoint the banner's mute uses, so the two
  // controls can never disagree. 0 clears the mute.
  async function muteOrderAlerts(minutes) {
    setBusy(true);
    try {
      const r = await orders.mute(minutes);
      setForm((f) => ({ ...f, order_alert_muted_until: r.muted_until }));
      Alert.alert(t('set.savedTitle'), t('oalert.setSaved'));
    } catch (e) { if (!isAuthError(e)) Alert.alert(t('common.failed'), e.response?.data?.error || e.message); }
    finally { setBusy(false); }
  }

  // Shop availability (batch A) — the daily window. Both ends or neither: the
  // server answers a one-sided window with 422 `hours_incomplete`, and we say so
  // here first so the owner reads an explanation rather than an error code.
  async function saveHours() {
    const hasOpen = Boolean(hours.open);
    const hasClose = Boolean(hours.close);
    if (hasOpen !== hasClose) {
      Alert.alert(t('open.hoursTitle'), t('open.hoursIncomplete'));
      return;
    }
    setBusy(true);
    try {
      const r = await shop.update({ open_time: hours.open || null, close_time: hours.close || null });
      setForm(r.shop);
      setHours({
        open: r.shop.open_time ? String(r.shop.open_time).slice(0, 5) : '',
        close: r.shop.close_time ? String(r.shop.close_time).slice(0, 5) : '',
      });
      Alert.alert(t('set.savedTitle'), t('open.hoursTitle'));
    } catch (e) { if (!isAuthError(e)) Alert.alert(t('common.failed'), e.response?.data?.error || e.message); }
    finally { setBusy(false); }
  }

  async function clearHours() {
    setBusy(true);
    try {
      const r = await shop.update({ open_time: null, close_time: null });
      setForm(r.shop);
      setHours({ open: '', close: '' });
    } catch (e) { if (!isAuthError(e)) Alert.alert(t('common.failed'), e.response?.data?.error || e.message); }
    finally { setBusy(false); }
  }

  async function addClosure() {
    if (!closureDraft.date) return;
    setBusy(true);
    try {
      const r = await shop.addClosure(closureDraft.date.trim(), closureDraft.reason.trim());
      setClosures(r.closures || []);
      setClosureDraft({ date: '', reason: '' });
    } catch (e) { if (!isAuthError(e)) Alert.alert(t('common.failed'), e.response?.data?.error || e.message); }
    finally { setBusy(false); }
  }

  async function removeClosure(id) {
    setBusy(true);
    try {
      const r = await shop.deleteClosure(id);
      setClosures(r.closures || []);
    } catch (e) { if (!isAuthError(e)) Alert.alert(t('common.failed'), e.response?.data?.error || e.message); }
    finally { setBusy(false); }
  }

  async function saveDiscovery() {
    setBusy(true);
    try {
      const r = await shop.update({
        city: form.city || null,
        area: form.area || null,
        latitude: form.latitude === '' || form.latitude == null ? null : Number(form.latitude),
        longitude: form.longitude === '' || form.longitude == null ? null : Number(form.longitude),
        is_listed: !!form.is_listed,
      });
      setForm(r.shop);
      Alert.alert(t('set.savedTitle'), t('set.discoverySaved'));
    } catch (e) { if (!isAuthError(e)) Alert.alert(t('common.failed'), e.response?.data?.error || e.message); }
    finally { setBusy(false); }
  }

  function confirmLogout() {
    Alert.alert(t('set.signOut'), t('set.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('set.signOut'), style: 'destructive', onPress: signOut },
    ]);
  }

  if (loading) return <View style={s.center}><ActivityIndicator color="#22c55e" /></View>;
  // Load finished but the shop never arrived (initial load failed) — offer a
  // retry instead of an endless spinner.
  if (!form) {
    return (
      <View style={s.center}>
        <Text style={s.loadFailed}>{t('common.loadFailed')}</Text>
        <Pressable style={s.retry} onPress={runLoad}>
          <Text style={s.retryText}>{t('common.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.container} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={s.h}>{t('set.shop')}</Text>
          <Text style={s.label}>{t('set.shopName')}</Text>
          <TextInput style={s.input} value={form.name || ''} onChangeText={(v) => set('name', v)} placeholderTextColor="#64748b" />
          <Text style={s.label}>{t('set.customerNotifications')}</Text>
          <View style={s.pillRow}>
            {NOTIF_MODES.map((m) => (
              <Pressable key={m.value} onPress={() => set('notification_mode', m.value)} style={[s.pill, form.notification_mode === m.value && s.pillActive]}>
                <Text style={[s.pillText, form.notification_mode === m.value && s.pillTextActive]}>{t(m.tkey)}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={[s.primary, busy && { opacity: 0.6 }]} onPress={saveBasics} disabled={busy}>
            <Text style={s.primaryText}>{t('common.save')}</Text>
          </Pressable>
        </View>

        {/* Shop availability (batch A) — the daily hours and the festival
            closures, mirroring the owner web console's "Shop hours" card. The
            Open/Closed switch and the pause chips are on HOME. */}
        <View style={s.card}>
          <Text style={s.h}>{t('open.hoursTitle')}</Text>
          <Text style={s.help}>{t('open.hoursHelp')}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>{t('open.openTime')}</Text>
              <TextInput
                style={s.input}
                value={hours.open}
                onChangeText={(v) => setHours((h) => ({ ...h, open: v }))}
                placeholder={t('open.timePlaceholder')}
                placeholderTextColor="#64748b"
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>{t('open.closeTime')}</Text>
              <TextInput
                style={s.input}
                value={hours.close}
                onChangeText={(v) => setHours((h) => ({ ...h, close: v }))}
                placeholder={t('open.timePlaceholder')}
                placeholderTextColor="#64748b"
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
              />
            </View>
          </View>
          {!hours.open && !hours.close ? <Text style={s.help}>{t('open.alwaysOpen')}</Text> : null}
          <View style={s.actions}>
            <Pressable style={[s.primary, { flex: 1 }, busy && { opacity: 0.6 }]} onPress={saveHours} disabled={busy}>
              <Text style={s.primaryText}>{t('open.saveHours')}</Text>
            </Pressable>
            <Pressable
              style={[s.secondary, { flex: 1 }, (busy || (!hours.open && !hours.close)) && { opacity: 0.6 }]}
              onPress={clearHours}
              disabled={busy || (!hours.open && !hours.close)}
            >
              <Text style={s.secondaryText}>{t('open.clearHours')}</Text>
            </Pressable>
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.h}>{t('open.closuresTitle')}</Text>
          <Text style={s.help}>{t('open.closuresHelp')}</Text>
          <Text style={s.label}>{t('open.closureDate')}</Text>
          <TextInput
            style={s.input}
            value={closureDraft.date}
            onChangeText={(v) => setClosureDraft((d) => ({ ...d, date: v }))}
            placeholder="2026-11-08"
            placeholderTextColor="#64748b"
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
          />
          <Text style={s.label}>{t('open.closureReason')}</Text>
          <TextInput
            style={s.input}
            value={closureDraft.reason}
            onChangeText={(v) => setClosureDraft((d) => ({ ...d, reason: v }))}
            placeholder={t('open.closureReasonPlaceholder')}
            placeholderTextColor="#64748b"
            maxLength={120}
          />
          <Pressable
            style={[s.primary, (busy || !closureDraft.date) && { opacity: 0.6 }]}
            onPress={addClosure}
            disabled={busy || !closureDraft.date}
          >
            <Text style={s.primaryText}>{t('open.addClosure')}</Text>
          </Pressable>
          {closures.length === 0 ? (
            <Text style={[s.help, { marginTop: 12 }]}>{t('open.noClosures')}</Text>
          ) : (
            closures.map((c) => (
              <View key={c.id} style={s.closureRow}>
                <Text style={s.closureDate}>{c.on_date}</Text>
                <Text style={s.closureReason} numberOfLines={1}>{c.reason || ''}</Text>
                <Pressable
                  style={[s.closureRemove, busy && { opacity: 0.6 }]}
                  onPress={() => removeClosure(c.id)}
                  disabled={busy}
                >
                  <Text style={s.closureRemoveText}>{t('open.removeClosure')}</Text>
                </Pressable>
              </View>
            ))
          )}
        </View>

        {/* Repeating new-order alert (batch ORDERALERT). Sits right below the
            shop card because it is the control an owner reaches for the moment
            the alert feels wrong — too often, or not wanted right now. */}
        <View style={s.card}>
          <Text style={s.h}>{t('oalert.setTitle')}</Text>
          <Text style={s.help}>{t('oalert.setHelp')}</Text>
          <View style={s.switchRow}>
            <Text style={s.body}>{t('oalert.setEnabled')}</Text>
            <Switch
              value={form.order_alert_enabled !== false}
              onValueChange={(v) => set('order_alert_enabled', v)}
              trackColor={{ true: '#22c55e', false: '#334155' }}
              thumbColor="#e2e8f0"
            />
          </View>
          <Text style={s.label}>{t('oalert.setRepeat')}</Text>
          <TextInput
            style={s.input}
            value={form.order_alert_repeat_minutes == null ? '' : String(form.order_alert_repeat_minutes)}
            onChangeText={(v) => set('order_alert_repeat_minutes', v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            placeholder="5"
            placeholderTextColor="#64748b"
          />
          <Text style={s.label}>{t('oalert.setMaxRepeats')}</Text>
          <TextInput
            style={s.input}
            value={form.order_alert_max_repeats == null ? '' : String(form.order_alert_max_repeats)}
            onChangeText={(v) => set('order_alert_max_repeats', v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            placeholder="6"
            placeholderTextColor="#64748b"
          />
          {form.order_alert_muted_until && new Date(form.order_alert_muted_until) > new Date() ? (
            <Text style={s.help}>{t('oalert.setMuted')}</Text>
          ) : null}
          <View style={s.actions}>
            <Pressable style={[s.primary, { flex: 1 }, busy && { opacity: 0.6 }]} onPress={saveOrderAlerts} disabled={busy}>
              <Text style={s.primaryText}>{t('common.save')}</Text>
            </Pressable>
            <Pressable
              style={[s.secondary, { flex: 1 }, busy && { opacity: 0.6 }]}
              onPress={() => muteOrderAlerts(
                form.order_alert_muted_until && new Date(form.order_alert_muted_until) > new Date() ? 0 : 30
              )}
              disabled={busy}
            >
              <Text style={s.secondaryText}>
                {form.order_alert_muted_until && new Date(form.order_alert_muted_until) > new Date()
                  ? t('oalert.unmute')
                  : t('oalert.setMuteNow')}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.h}>{t('set.payments')}</Text>
          <View style={s.badgeRow}>
            <Text style={s.badge}>{t('set.modeLabel')} {pay?.mode || '—'}</Text>
            <Text style={s.badge}>{pay?.key_secret_set ? t('set.keySecretSet') : t('set.noKeySecret')}</Text>
            <Text style={s.badge}>{pay?.webhook_secret_set ? t('set.webhookSecretSet') : t('set.noWebhookSecret')}</Text>
          </View>
          <Text style={s.label}>{t('set.razorpayKeyId')}</Text>
          <TextInput style={s.input} value={payForm.razorpay_key_id} onChangeText={(v) => setPayForm((f) => ({ ...f, razorpay_key_id: v }))} placeholder="rzp_live_… / rzp_test_…" placeholderTextColor="#64748b" autoCapitalize="none" />
          <Text style={s.label}>{t('set.keySecret')}</Text>
          <TextInput style={s.input} value={payForm.razorpay_key_secret} onChangeText={(v) => setPayForm((f) => ({ ...f, razorpay_key_secret: v }))} placeholder={t('set.leaveBlank')} placeholderTextColor="#64748b" secureTextEntry autoCapitalize="none" />
          <Text style={s.label}>{t('set.webhookSecret')}</Text>
          <TextInput style={s.input} value={payForm.razorpay_webhook_secret} onChangeText={(v) => setPayForm((f) => ({ ...f, razorpay_webhook_secret: v }))} placeholder={t('set.leaveBlank')} placeholderTextColor="#64748b" secureTextEntry autoCapitalize="none" />
          <View style={s.actions}>
            <Pressable style={[s.primary, { flex: 1 }, busy && { opacity: 0.6 }]} onPress={savePayment} disabled={busy}>
              <Text style={s.primaryText}>{t('common.save')}</Text>
            </Pressable>
            <Pressable style={[s.secondary, { flex: 1 }, busy && { opacity: 0.6 }]} onPress={testPayment} disabled={busy}>
              <Text style={s.secondaryText}>{t('set.testConnection')}</Text>
            </Pressable>
          </View>
          {pay?.webhook_url ? (
            <View style={{ marginTop: 12 }}>
              <Text style={s.label}>{t('set.webhookHint')}</Text>
              <Text selectable style={s.code}>{pay.webhook_url}</Text>
            </View>
          ) : null}
        </View>

        <View style={s.card}>
          <Text style={s.h}>{t('set.discovery')}</Text>
          <Text style={s.label}>{t('set.city')}</Text>
          <TextInput style={s.input} value={form.city || ''} onChangeText={(v) => set('city', v)} placeholder={t('set.city')} placeholderTextColor="#64748b" />
          <Text style={s.label}>{t('set.areaLocality')}</Text>
          <TextInput style={s.input} value={form.area || ''} onChangeText={(v) => set('area', v)} placeholder={t('set.areaPlaceholder')} placeholderTextColor="#64748b" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>{t('set.latitude')}</Text>
              <TextInput style={s.input} value={form.latitude == null ? '' : String(form.latitude)} onChangeText={(v) => set('latitude', v)} keyboardType="numbers-and-punctuation" placeholder="19.0760" placeholderTextColor="#64748b" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>{t('set.longitude')}</Text>
              <TextInput style={s.input} value={form.longitude == null ? '' : String(form.longitude)} onChangeText={(v) => set('longitude', v)} keyboardType="numbers-and-punctuation" placeholder="72.8777" placeholderTextColor="#64748b" />
            </View>
          </View>
          <View style={s.switchRow}>
            <Text style={s.body}>{t('set.listShop')}</Text>
            <Switch value={!!form.is_listed} onValueChange={(v) => set('is_listed', v)} trackColor={{ true: '#22c55e', false: '#334155' }} thumbColor="#e2e8f0" />
          </View>
          <Pressable style={[s.primary, busy && { opacity: 0.6 }]} onPress={saveDiscovery} disabled={busy}>
            <Text style={s.primaryText}>{t('common.save')}</Text>
          </Pressable>
        </View>

        <View style={s.card}>
          <Text style={s.h}>{t('settings.language')}</Text>
          <View style={s.langWrap}>
            {LANGUAGES.map((l) => (
              <Pressable
                key={l.code}
                onPress={() => setLang(l.code)}
                style={[s.lang, lang === l.code && s.langActive]}
              >
                <Text style={[s.langText, lang === l.code && s.langTextActive]}>
                  {l.label}{isBetaLang(l.code) ? t('settings.betaSuffix') : ''}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable style={s.logout} onPress={confirmLogout}>
          <Text style={s.logoutText}>{t('set.logout')}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  center: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadFailed: { color: '#94a3b8', fontSize: 15, textAlign: 'center', marginBottom: 16 },
  retry: { backgroundColor: '#22c55e', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  retryText: { color: '#000', fontWeight: '700' },
  card: { backgroundColor: '#1e293b', padding: 16, borderRadius: 12, marginBottom: 12 },
  h: { color: '#e2e8f0', fontSize: 17, fontWeight: '700', marginBottom: 8 },
  label: { color: '#94a3b8', fontSize: 13, marginTop: 12, marginBottom: 6 },
  body: { color: '#e2e8f0', fontSize: 14, flex: 1, paddingRight: 12 },
  help: { color: '#94a3b8', fontSize: 13, lineHeight: 18, marginBottom: 4 },
  input: { backgroundColor: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 10 },
  pillRow: { flexDirection: 'row', gap: 8 },
  pill: { backgroundColor: '#0f172a', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999 },
  pillActive: { backgroundColor: '#22c55e' },
  pillText: { color: '#94a3b8' },
  pillTextActive: { color: '#000', fontWeight: '700' },
  badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  badge: { color: '#94a3b8', fontSize: 11, backgroundColor: '#0f172a', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  primary: { backgroundColor: '#22c55e', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 16 },
  primaryText: { color: '#000', fontWeight: '700' },
  secondary: { backgroundColor: '#334155', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 16 },
  secondaryText: { color: '#e2e8f0', fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8 },
  code: { color: '#e2e8f0', backgroundColor: '#0b1220', borderWidth: 1, borderColor: '#334155', borderRadius: 8, padding: 10, marginTop: 4, fontSize: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  closureRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12,
    borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 12,
  },
  closureDate: { color: '#e2e8f0', fontSize: 15, fontWeight: '700' },
  closureReason: { color: '#94a3b8', fontSize: 14, flex: 1 },
  closureRemove: {
    minHeight: 44, paddingHorizontal: 14, borderRadius: 10,
    backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center',
  },
  closureRemoveText: { color: '#f87171', fontWeight: '700' },
  langWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  lang: {
    borderWidth: 1, borderColor: '#334155', borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 10, minHeight: 44, justifyContent: 'center',
  },
  langActive: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  langText: { color: '#e2e8f0', fontSize: 15, fontWeight: '600' },
  langTextActive: { color: '#000' },
  logout: { backgroundColor: '#1e293b', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 4, marginBottom: 20, borderWidth: 1, borderColor: '#f87171' },
  logoutText: { color: '#f87171', fontWeight: '700' },
});
