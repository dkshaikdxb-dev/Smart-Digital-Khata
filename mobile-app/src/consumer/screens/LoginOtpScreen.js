import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { colors, sizes } from '../theme';
import { Card, Button, Field, ErrorBanner } from '../components';
import { consumerAuth } from '../consumerApi';
import { useConsumerAuth } from '../ConsumerAuthContext';
import { useT } from '../i18n';

// Priority 1 — OTP auth. Step 1: enter phone -> request-otp. Step 2: enter the
// 6-digit code -> verify-otp -> store token -> signed in. Mirrors c/login.js
// (field name is `code`, response is { token, customer_user }). dev_code is
// echoed by the backend only outside production / for allow-listed demo numbers.
export default function LoginOtpScreen() {
  const { t } = useT();
  const { signIn } = useConsumerAuth();
  const [step, setStep] = useState('phone'); // 'phone' | 'code'
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function requestOtp() {
    setError('');
    setLoading(true);
    try {
      const r = await consumerAuth.requestOtp(phone.trim());
      setDevCode(r && r.dev_code ? String(r.dev_code) : '');
      setStep('code');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setError('');
    setLoading(true);
    try {
      const r = await consumerAuth.verifyOtp(phone.trim(), code.trim());
      if (!r || !r.token) throw new Error(t('login.failed'));
      await signIn(r.token);
      // signIn flips the navigator to the tabs; nothing more to do here.
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.heroIcon}>🛍️</Text>
          <Text style={styles.heroTitle}>{t('app.name')}</Text>
          <Text style={styles.heroBlurb}>{t('login.blurb')}</Text>
        </View>

        {step === 'phone' ? (
          <Card>
            <Field
              label={t('login.mobile')}
              value={phone}
              onChangeText={setPhone}
              placeholder="+91XXXXXXXXXX"
              keyboardType="phone-pad"
              autoCapitalize="none"
              hint={t('login.otpHint')}
            />
            <ErrorBanner>{error}</ErrorBanner>
            <Button
              title={loading ? t('login.sending') : t('login.sendCode')}
              onPress={requestOtp}
              loading={loading}
              disabled={phone.trim().length < 10}
            />
          </Card>
        ) : (
          <Card>
            <Field
              label={t('login.enterCode', { phone: phone.trim() })}
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
              placeholder={t('login.codePlaceholder')}
              keyboardType="number-pad"
              maxLength={6}
            />
            {devCode ? (
              <Text style={styles.devCode}>
                {t('login.devCode')} <Text style={styles.devCodeStrong}>{devCode}</Text>
              </Text>
            ) : null}
            <ErrorBanner>{error}</ErrorBanner>
            <Button
              title={loading ? t('login.verifying') : t('login.verify')}
              onPress={verifyOtp}
              loading={loading}
              disabled={code.length !== 6}
            />
            <View style={styles.row}>
              <Button
                title={t('login.changeNumber')}
                variant="secondary"
                onPress={() => { setStep('phone'); setCode(''); setError(''); setDevCode(''); }}
                style={styles.rowBtn}
              />
              <Button
                title={t('login.resend')}
                variant="secondary"
                onPress={requestOtp}
                disabled={loading}
                style={styles.rowBtn}
              />
            </View>
          </Card>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: sizes.pad, paddingTop: 40 },
  hero: { alignItems: 'center', marginBottom: 24 },
  heroIcon: { fontSize: 56, marginBottom: 8 },
  heroTitle: { color: colors.text, fontSize: 26, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  heroBlurb: { color: colors.textMuted, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  devCode: { color: colors.warn, fontSize: 15, marginBottom: 12 },
  devCodeStrong: { fontWeight: '800' },
  row: { flexDirection: 'row', gap: sizes.gap, marginTop: sizes.gap },
  rowBtn: { flex: 1 },
});
