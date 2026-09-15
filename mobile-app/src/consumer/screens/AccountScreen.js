import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Alert, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import Constants from 'expo-constants';
import { useFocusEffect } from '@react-navigation/native';
import { colors, sizes } from '../theme';
import { Card, Field, Button, ErrorBanner } from '../components';
import UpdateStatusCard from '../components/UpdateStatusCard';
import { consumerAuth, setToken } from '../consumerApi';
import { useConsumerAuth } from '../ConsumerAuthContext';
import { useT, LANGUAGES, isBetaLang } from '../i18n';
import { useDataSaver } from '../lib/dataSaver';
import { isIsoDay } from '../lib/dateRange';

// The consumer PWA base (`…/c`), bridged with the consumer token by FeatureWebView.
const CONSUMER_URL =
  Constants.expoConfig?.extra?.consumerUrl || 'https://khata.dadashaik.com/c';

// The gender values the API accepts, in the web's order. The VALUE is the stored
// enum and never localized; only the chip label is.
const GENDERS = [
  { value: '', labelKey: 'account.genderUnset' },
  { value: 'male', labelKey: 'account.genderMale' },
  { value: 'female', labelKey: 'account.genderFemale' },
  { value: 'other', labelKey: 'account.genderOther' },
  { value: 'prefer_not_to_say', labelKey: 'account.genderPreferNot' },
];

// Priority 6 — Account. Editable profile (name, email, gender, date of birth;
// phone read-only), the running-bundle card, a hub for the things that deserve
// their own screen, a language switch, a data-saver toggle, and logout.
//
// WHY A HUB AND NOT ONE LONG PAGE. The web puts profile, number change, PIN,
// statement, downloads, referrals and FAQ on a single scrolling page, which is
// fine at desk width. On a 320dp phone that is a page nobody reaches the bottom
// of. So each of those is its own screen in the Account stack and this screen
// lists them — four taps' worth of destination instead of one endless scroll.
export default function AccountScreen({ navigation }) {
  const { t, lang, setLang } = useT();
  const { signOut } = useConsumerAuth();
  const { dataSaver, setDataSaver } = useDataSaver();
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
      setForm({
        name: cu.name || '',
        email: cu.email || '',
        gender: cu.gender || '',
        // The API sends a full timestamp; the field edits a plain day.
        date_of_birth: cu.date_of_birth ? String(cu.date_of_birth).slice(0, 10) : '',
      });
    } catch (err) {
      setError(err.message || t('account.loadError'));
      setForm({ name: '', email: '', gender: '', date_of_birth: '' });
    }
  }, [t]);

  // Reloaded on FOCUS, not just on mount: the number-change screen pushes on top
  // of this one and, when it succeeds, the phone shown here is out of date the
  // moment the shopper taps back. Showing them their old number after they just
  // changed it reads as the change having failed.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function save() {
    setMsg('');
    setError('');
    // A half-typed date must not reach the server: Joi would reject it with a
    // generic 400 and the shopper would be told "something was not right" about
    // a form where everything else was fine.
    if (form.date_of_birth && !isIsoDay(form.date_of_birth)) {
      setError(t('account.dobInvalid'));
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name || null,
        email: form.email || null,
        // '' is not a valid enum; an unset value is explicitly null.
        gender: form.gender || null,
        date_of_birth: form.date_of_birth || null,
      };
      const r = await consumerAuth.updateProfile(body);
      const cu = r.customer_user || {};
      setForm({
        name: cu.name || '',
        email: cu.email || '',
        gender: cu.gender || '',
        date_of_birth: cu.date_of_birth ? String(cu.date_of_birth).slice(0, 10) : '',
      });
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
              hint={t('account.phoneReadonly')}
            />
            <Field
              label={`${t('account.email')} (${t('account.optional')})`}
              value={form.email}
              onChangeText={(v) => setForm({ ...form, email: v })}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            {/* Chips, not a dropdown: RN has no cross-platform <select> and five
                fixed choices fit on one screen at full tap size anyway. */}
            <Text style={styles.label}>{`${t('account.gender')} (${t('account.optional')})`}</Text>
            <View style={styles.chips}>
              {GENDERS.map((g) => (
                <Pressable
                  key={g.value || 'unset'}
                  onPress={() => setForm({ ...form, gender: g.value })}
                  style={[styles.chip, form.gender === g.value && styles.chipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: form.gender === g.value }}
                >
                  <Text style={[styles.chipText, form.gender === g.value && styles.chipTextActive]}>
                    {t(g.labelKey)}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* A typed day, not a picker. Every RN date picker is a native
                module and a native module means an EAS rebuild, which would put
                this whole change out of reach of the phones it is meant for. */}
            <Field
              label={`${t('account.dob')} (${t('account.optional')})`}
              value={form.date_of_birth}
              onChangeText={(v) => setForm({ ...form, date_of_birth: v })}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
            />

            <Button title={saving ? t('account.saving') : t('account.save')} onPress={save} loading={saving} />
            {msg ? <Text style={styles.msg}>{msg}</Text> : null}
          </Card>
        ) : null}

        {/* Which bundle is running. Deliberately high on the page: when someone
            reports "the app still looks old", this is the answer. */}
        <UpdateStatusCard />

        <Card>
          <Text style={styles.title}>{t('account.manage')}</Text>
          <HubRow
            icon="📱"
            label={t('num.change')}
            onPress={() => navigation.navigate('ChangeNumber', { phone })}
          />
          <HubRow
            icon="🧾"
            label={t('stmt.title')}
            onPress={() => navigation.navigate('Statement')}
          />
          <HubRow
            icon="🎁"
            label={t('ref.title')}
            onPress={() => navigation.navigate('Referral')}
          />
          <HubRow
            icon="❓"
            label={t('chelp.title')}
            onPress={() => navigation.navigate('HelpFaq')}
            last
          />
        </Card>

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

        <Card>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.title}>{t('account.dataSaver')}</Text>
              <Text style={styles.switchSub}>{t('account.dataSaverSub')}</Text>
            </View>
            <Switch
              value={dataSaver}
              onValueChange={setDataSaver}
              trackColor={{ false: colors.border, true: colors.accentDark }}
              thumbColor={dataSaver ? colors.accent : colors.textMuted}
              ios_backgroundColor={colors.border}
              accessibilityLabel={t('account.dataSaver')}
            />
          </View>
        </Card>

        <Button title={`🚪 ${t('account.logout')}`} variant="secondary" onPress={confirmLogout} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function HubRow({ icon, label, onPress, last }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.hubRow, !last && styles.hubRowDivider]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.hubIcon} accessibilityElementsHidden importantForAccessibility="no">{icon}</Text>
      <Text style={styles.hubLabel} numberOfLines={2}>{label}</Text>
      <Text style={styles.hubChev}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: sizes.pad },
  title: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  subtitle: { color: colors.textMuted, fontSize: 13, marginBottom: 14 },
  label: { color: colors.textMuted, fontSize: 14, marginBottom: 6, fontWeight: '600' },
  msg: { color: colors.accent, fontSize: 14, marginTop: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: sizes.gap },
  chip: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 999,
    paddingHorizontal: 16, minHeight: 44, alignItems: 'center', justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  chipTextActive: { color: colors.onAccent },
  hubRow: { flexDirection: 'row', alignItems: 'center', minHeight: sizes.tap },
  hubRowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  hubIcon: { fontSize: 20, marginRight: 12 },
  hubLabel: { color: colors.text, fontSize: 16, fontWeight: '600', flex: 1, paddingRight: 10 },
  hubChev: { color: colors.textMuted, fontSize: 24, fontWeight: '800' },
  langWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  lang: {
    borderWidth: 1, borderColor: colors.border, borderRadius: sizes.radius,
    paddingHorizontal: 18, paddingVertical: 12, minHeight: 48, justifyContent: 'center',
  },
  langActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  langText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  langTextActive: { color: colors.onAccent },
  switchRow: { flexDirection: 'row', alignItems: 'center', minHeight: sizes.tap },
  switchText: { flex: 1, paddingRight: 12 },
  switchSub: { color: colors.textMuted, fontSize: 13 },
});
