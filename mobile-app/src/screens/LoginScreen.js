import React, { useState, useContext } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { auth } from '../services/api';
import { AuthContext } from '../AuthContext';
import { useT } from '../i18n';

export default function LoginScreen() {
  const { t } = useT();
  const { signIn } = useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      const data = await auth.login(email, password);
      signIn(data.user?.role || 'owner');
    } catch (e) {
      Alert.alert(t('login.failed'), e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={s.title}>{t('app.name')}</Text>
      <Text style={s.subtitle}>{t('login.subtitle')}</Text>
      <TextInput style={s.input} placeholder={t('login.email')} placeholderTextColor="#64748b" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={s.input} placeholder={t('login.password')} placeholderTextColor="#64748b" secureTextEntry value={password} onChangeText={setPassword} />
      <Pressable style={s.button} onPress={submit} disabled={loading}>
        <Text style={s.buttonText}>{loading ? t('login.signingIn') : t('login.signIn')}</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#0f172a' },
  title: { color: '#e2e8f0', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#94a3b8', marginBottom: 24 },
  input: { backgroundColor: '#1e293b', color: '#e2e8f0', padding: 14, borderRadius: 10, marginBottom: 12 },
  button: { backgroundColor: '#22c55e', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#000', fontWeight: '700' },
});
