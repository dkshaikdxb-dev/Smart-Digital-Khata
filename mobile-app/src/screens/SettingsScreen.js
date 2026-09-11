import React, { useEffect, useState, useCallback, useContext } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable, Alert, ScrollView,
  ActivityIndicator, Switch, KeyboardAvoidingView, Platform,
} from 'react-native';
import { shop } from '../services/api';
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

  const loadPayment = useCallback(async () => {
    const p = await shop.payment();
    setPay(p);
    setPayForm({ razorpay_key_id: p.key_id || '', razorpay_key_secret: '', razorpay_webhook_secret: '' });
  }, []);

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([shop.me(), shop.payment()]);
    setForm(s.shop);
    setPay(p);
    setPayForm({ razorpay_key_id: p.key_id || '', razorpay_key_secret: '', razorpay_webhook_secret: '' });
  }, []);

  useEffect(() => {
    load().catch((e) => Alert.alert(t('common.error'), e.response?.data?.error || e.message)).finally(() => setLoading(false));
  }, [load, t]);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function saveBasics() {
    setBusy(true);
    try {
      const r = await shop.update({ name: form.name, notification_mode: form.notification_mode });
      setForm(r.shop);
      Alert.alert(t('set.savedTitle'), t('set.shopSaved'));
    } catch (e) { Alert.alert(t('common.failed'), e.response?.data?.error || e.message); }
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
    } catch (e) { Alert.alert(t('common.failed'), e.response?.data?.error || e.message); }
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
    } catch (e) { Alert.alert(t('set.connFailedTitle'), e.response?.data?.error || e.message); }
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
    } catch (e) { Alert.alert(t('common.failed'), e.response?.data?.error || e.message); }
    finally { setBusy(false); }
  }

  function confirmLogout() {
    Alert.alert(t('set.signOut'), t('set.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('set.signOut'), style: 'destructive', onPress: signOut },
    ]);
  }

  if (loading || !form) return <View style={s.center}><ActivityIndicator color="#22c55e" /></View>;

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
  center: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#1e293b', padding: 16, borderRadius: 12, marginBottom: 12 },
  h: { color: '#e2e8f0', fontSize: 17, fontWeight: '700', marginBottom: 8 },
  label: { color: '#94a3b8', fontSize: 13, marginTop: 12, marginBottom: 6 },
  body: { color: '#e2e8f0', fontSize: 14, flex: 1, paddingRight: 12 },
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
