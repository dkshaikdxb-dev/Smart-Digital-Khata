import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { colors, sizes } from '../theme';
import { Card, Field, Button, ErrorBanner } from '../components';
import { consumerAuth, setToken } from '../consumerApi';
import { refusalError } from '../lib/errorText';
import { useT } from '../i18n';

// Change the mobile number this account signs in with.
//
// Why this is on a phone at all: a number change is not a settings nicety here,
// it is how a shopper keeps their khata when they change SIM — and changing SIM
// is ordinary. The balance at every shop is keyed to the phone number, so
// without this the only path is to ask each shopkeeper to edit it by hand, or
// to start again from zero and lose the ledger. `num.newHint` says exactly that,
// and it is the sentence the web already shows.
//
// Two steps, both authenticated as the CURRENT number; the second also proves
// control of the new one with a code sent there. On success the server hands
// back a token that authenticates as the (possibly merged) identity on the new
// number, so it is stored immediately — skipping that would leave the app
// holding a token for a phone number that no longer exists.
export default function ChangeNumberScreen({ route, navigation }) {
  const { t } = useT();
  const [phone, setPhone] = useState(route.params?.phone || '');
  // 'idle' -> enter the new number; 'code' -> confirm the code sent to it.
  const [step, setStep] = useState('idle');
  const [newPhone, setNewPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  async function sendCode() {
    setError(''); setMsg(''); setBusy(true);
    try {
      const r = await consumerAuth.changeNumberRequest(newPhone.trim());
      setDevCode(r && r.dev_code ? String(r.dev_code) : '');
      setStep('code');
    } catch (err) {
      setError(refusalError(t, err));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setError(''); setMsg(''); setBusy(true);
    try {
      const r = await consumerAuth.changeNumberVerify(newPhone.trim(), code.trim());
      // Store the rolled token BEFORE anything else: from this point the old
      // number's token is dead and every later request needs the new one.
      if (r && r.token) {
        try { await setToken(r.token); } catch (e) { /* keep going; the screen still reports success */ }
      }
      const next = (r && r.customer_user && r.customer_user.phone) || newPhone.trim();
      setPhone(next);
      setStep('idle'); setNewPhone(''); setCode(''); setDevCode('');
      setMsg(t('num.changed'));
    } catch (err) {
      setError(refusalError(t, err));
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setStep('idle'); setNewPhone(''); setCode(''); setDevCode(''); setError(''); setMsg('');
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ErrorBanner>{error}</ErrorBanner>

        <Card>
          <Text style={styles.title}>{t('num.title')}</Text>
          <Field label={t('num.current')} value={phone} editable={false} />

          {step === 'idle' ? (
            <>
              <Field
                label={t('num.new')}
                value={newPhone}
                onChangeText={setNewPhone}
                placeholder="+91XXXXXXXXXX"
                keyboardType="phone-pad"
                autoCapitalize="none"
                hint={t('num.newHint')}
              />
              <Button
                title={busy ? t('num.sending') : t('num.sendCode')}
                onPress={sendCode}
                loading={busy}
                disabled={!newPhone.trim()}
              />
            </>
          ) : (
            <>
              <Field
                label={t('num.enterCode', { phone: newPhone.trim() })}
                value={code}
                // Digits only: the server takes a 4-6 digit code and a stray
                // space pasted from a message would otherwise read as a wrong code.
                onChangeText={(v) => setCode(String(v).replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={6}
                placeholder={t('login.codePlaceholder')}
              />
              {devCode ? <Text style={styles.dev}>{t('num.devCode')} {devCode}</Text> : null}
              <Button
                title={busy ? t('num.changing') : t('num.confirm')}
                onPress={confirm}
                loading={busy}
                disabled={code.length < 4}
              />
              <Button title={t('num.cancel')} variant="secondary" onPress={cancel} style={styles.cancel} />
            </>
          )}

          {msg ? <Text style={styles.msg}>{msg}</Text> : null}
        </Card>

        {msg ? (
          <Button title={t('common.back')} variant="secondary" onPress={() => navigation.goBack()} />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: sizes.pad },
  title: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 12 },
  dev: { color: colors.warn, fontSize: 14, marginBottom: 12 },
  cancel: { marginTop: 10 },
  msg: { color: colors.accent, fontSize: 15, marginTop: 12 },
});
