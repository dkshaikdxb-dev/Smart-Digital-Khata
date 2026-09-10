import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import Constants from 'expo-constants';
import { colors, sizes } from '../theme';
import { Card, Field, Button, ErrorBanner } from '../components';
import { consumerAuth, setToken } from '../consumerApi';
import { useConsumerAuth } from '../ConsumerAuthContext';
import { useT, LANGUAGES, isBetaLang } from '../i18n';

// The consumer PWA base (`…/c`), bridged with the consumer token by FeatureWebView.
const CONSUMER_URL =
  Constants.expoConfig?.extra?.consumerUrl || 'https://khata.dadashaik.com/c';

// Priority 6 — Account: editable profile (name/email; phone read-only), a
// language switch, and logout. Profile via GET/PATCH /customer-auth/*.
export default function AccountScreen({ navigation }) {
  const { t, lang, setLang } = useT();
  const { signOut } = useConsumerAuth();
  const [form, setForm] = useState(null);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await consumerAuth.me();
      // Long-session refresh-on-use: swap in a rolled token when the server
      // returns one, so the 90-day window keeps this device signed in.
      if (r.token) { try { await setToken(r.token); } catch (e) { /* ignore */ } }
      const cu = r.customer_user || {};
      setPhone(cu.phone || r.phone || '');
      setForm({ name: cu.name || '', email: cu.email || '' });
    } catch (err) {
      setError(err.message || t('account.loadError'));
      setForm({ name: '', email: '' });
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    setMsg('');
    setError('');
    try {
      const body = { name: form.name || null, email: form.email || null };
      const r = await consumerAuth.updateProfile(body);
      const cu = r.customer_user || {};
      setForm({ name: cu.name || '', email: cu.email || '' });
      setMsg(t('account.saved'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function confirmLogout() {
    Alert.alert(t('account.logout'), t('account.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('account.logout'), style: 'destructive', onPress: () => signOut() },
    ]);
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ErrorBanner>{error}</ErrorBanner>

        {form ? (
          <Card>
            <Text style={styles.title}>{t('account.profile')}</Text>
            <Text style={styles.subtitle}>{t('account.subtitle')}</Text>
            <Field
              label={`${t('account.name')} (${t('account.optional')})`}
              value={form.name}
              onChangeText={(v) => setForm({ ...form, name: v })}
            />
            <Field
              label={t('account.phone')}
              value={phone}
              editable={false}
            />
            <Field
              label={`${t('account.email')} (${t('account.optional')})`}
              value={form.email}
              onChangeText={(v) => setForm({ ...form, email: v })}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Button title={saving ? t('account.saving') : t('account.save')} onPress={save} loading={saving} />
            {msg ? <Text style={styles.msg}>{msg}</Text> : null}
          </Card>
        ) : null}

        <Card>
          <Text style={styles.title}>{t('account.moreOnWeb')}</Text>
          <Text style={styles.subtitle}>{t('account.prepaySub')}</Text>
          <Button
            title={t('account.prepay')}
            variant="secondary"
            onPress={() => navigation.navigate('FeatureWebView', {
              base: CONSUMER_URL,
              path: '/khata',
              title: t('account.prepay'),
            })}
          />
        </Card>

        <Card>
          <Text style={styles.title}>{t('account.language')}</Text>
          <View style={styles.langWrap}>
            {LANGUAGES.map((l) => (
              <Pressable
                key={l.code}
                onPress={() => setLang(l.code)}
                style={[styles.lang, lang === l.code && styles.langActive]}
              >
                <Text style={[styles.langText, lang === l.code && styles.langTextActive]}>
                  {l.label}{isBetaLang(l.code) ? t('login.betaSuffix') : ''}
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>

        <Button title={`🚪 ${t('account.logout')}`} variant="secondary" onPress={confirmLogout} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: sizes.pad },
  title: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  subtitle: { color: colors.textMuted, fontSize: 13, marginBottom: 14 },
  msg: { color: colors.accent, fontSize: 14, marginTop: 10 },
  langWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  lang: {
    borderWidth: 1, borderColor: colors.border, borderRadius: sizes.radius,
    paddingHorizontal: 18, paddingVertical: 12, minHeight: 48, justifyContent: 'center',
  },
  langActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  langText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  langTextActive: { color: colors.onAccent },
});
