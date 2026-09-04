import React, { useEffect, useState, useCallback, useContext } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable, Alert, ScrollView,
  ActivityIndicator, Switch, KeyboardAvoidingView, Platform,
} from 'react-native';
import { shop } from '../services/api';
import { AuthContext } from '../AuthContext';

const NOTIF_MODES = [
  { value: 'silent', label: 'Silent' },
  { value: 'smart', label: 'Smart' },
  { value: 'active', label: 'Active' },
];

export default function SettingsScreen() {
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
    load().catch((e) => Alert.alert('Error', e.response?.data?.error || e.message)).finally(() => setLoading(false));
  }, [load]);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function saveBasics() {
    setBusy(true);
    try {
      const r = await shop.update({ name: form.name, notification_mode: form.notification_mode });
      setForm(r.shop);
      Alert.alert('Saved', 'Shop settings updated.');
    } catch (e) { Alert.alert('Failed', e.response?.data?.error || e.message); }
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
      Alert.alert('Saved', 'Payment settings saved.');
    } catch (e) { Alert.alert('Failed', e.response?.data?.error || e.message); }
    finally { setBusy(false); }
  }

  async function testPayment() {
    setBusy(true);
    try {
      const r = await shop.testPayment();
      Alert.alert(r.ok ? 'Connection OK' : 'Connection failed', r.message || (r.ok ? 'Your Razorpay keys work.' : 'Check your keys.'));
    } catch (e) { Alert.alert('Connection failed', e.response?.data?.error || e.message); }
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
      Alert.alert('Saved', 'Discovery settings updated.');
    } catch (e) { Alert.alert('Failed', e.response?.data?.error || e.message); }
    finally { setBusy(false); }
  }

  function confirmLogout() {
    Alert.alert('Sign out', 'Sign out of this account?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  }

  if (loading || !form) return <View style={s.center}><ActivityIndicator color="#22c55e" /></View>;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.container} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={s.h}>Shop</Text>
          <Text style={s.label}>Shop name</Text>
          <TextInput style={s.input} value={form.name || ''} onChangeText={(v) => set('name', v)} placeholderTextColor="#64748b" />
          <Text style={s.label}>Customer notifications</Text>
          <View style={s.pillRow}>
            {NOTIF_MODES.map((m) => (
              <Pressable key={m.value} onPress={() => set('notification_mode', m.value)} style={[s.pill, form.notification_mode === m.value && s.pillActive]}>
                <Text style={[s.pillText, form.notification_mode === m.value && s.pillTextActive]}>{m.label}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={[s.primary, busy && { opacity: 0.6 }]} onPress={saveBasics} disabled={busy}>
            <Text style={s.primaryText}>Save</Text>
          </Pressable>
        </View>

        <View style={s.card}>
          <Text style={s.h}>Payments (your Razorpay)</Text>
          <View style={s.badgeRow}>
            <Text style={s.badge}>Mode: {pay?.mode || '—'}</Text>
            <Text style={s.badge}>{pay?.key_secret_set ? 'Key secret set' : 'No key secret'}</Text>
            <Text style={s.badge}>{pay?.webhook_secret_set ? 'Webhook secret set' : 'No webhook secret'}</Text>
          </View>
          <Text style={s.label}>Razorpay Key ID</Text>
          <TextInput style={s.input} value={payForm.razorpay_key_id} onChangeText={(v) => setPayForm((f) => ({ ...f, razorpay_key_id: v }))} placeholder="rzp_live_… / rzp_test_…" placeholderTextColor="#64748b" autoCapitalize="none" />
          <Text style={s.label}>Key Secret</Text>
          <TextInput style={s.input} value={payForm.razorpay_key_secret} onChangeText={(v) => setPayForm((f) => ({ ...f, razorpay_key_secret: v }))} placeholder="Leave blank to keep current" placeholderTextColor="#64748b" secureTextEntry autoCapitalize="none" />
          <Text style={s.label}>Webhook Secret</Text>
          <TextInput style={s.input} value={payForm.razorpay_webhook_secret} onChangeText={(v) => setPayForm((f) => ({ ...f, razorpay_webhook_secret: v }))} placeholder="Leave blank to keep current" placeholderTextColor="#64748b" secureTextEntry autoCapitalize="none" />
          <View style={s.actions}>
            <Pressable style={[s.primary, { flex: 1 }, busy && { opacity: 0.6 }]} onPress={savePayment} disabled={busy}>
              <Text style={s.primaryText}>Save</Text>
            </Pressable>
            <Pressable style={[s.secondary, { flex: 1 }, busy && { opacity: 0.6 }]} onPress={testPayment} disabled={busy}>
              <Text style={s.secondaryText}>Test connection</Text>
            </Pressable>
          </View>
          {pay?.webhook_url ? (
            <View style={{ marginTop: 12 }}>
              <Text style={s.label}>Add this webhook in YOUR Razorpay dashboard:</Text>
              <Text selectable style={s.code}>{pay.webhook_url}</Text>
            </View>
          ) : null}
        </View>

        <View style={s.card}>
          <Text style={s.h}>Discovery (list your shop)</Text>
          <Text style={s.label}>City</Text>
          <TextInput style={s.input} value={form.city || ''} onChangeText={(v) => set('city', v)} placeholder="City" placeholderTextColor="#64748b" />
          <Text style={s.label}>Area / locality</Text>
          <TextInput style={s.input} value={form.area || ''} onChangeText={(v) => set('area', v)} placeholder="Area" placeholderTextColor="#64748b" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Latitude</Text>
              <TextInput style={s.input} value={form.latitude == null ? '' : String(form.latitude)} onChangeText={(v) => set('latitude', v)} keyboardType="numbers-and-punctuation" placeholder="19.0760" placeholderTextColor="#64748b" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Longitude</Text>
              <TextInput style={s.input} value={form.longitude == null ? '' : String(form.longitude)} onChangeText={(v) => set('longitude', v)} keyboardType="numbers-and-punctuation" placeholder="72.8777" placeholderTextColor="#64748b" />
            </View>
          </View>
          <View style={s.switchRow}>
            <Text style={s.body}>List my shop for nearby customers</Text>
            <Switch value={!!form.is_listed} onValueChange={(v) => set('is_listed', v)} trackColor={{ true: '#22c55e', false: '#334155' }} thumbColor="#e2e8f0" />
          </View>
          <Pressable style={[s.primary, busy && { opacity: 0.6 }]} onPress={saveDiscovery} disabled={busy}>
            <Text style={s.primaryText}>Save</Text>
          </Pressable>
        </View>

        <Pressable style={s.logout} onPress={confirmLogout}>
          <Text style={s.logoutText}>Log out</Text>
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
  logout: { backgroundColor: '#1e293b', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 4, marginBottom: 20, borderWidth: 1, borderColor: '#f87171' },
  logoutText: { color: '#f87171', fontWeight: '700' },
});
