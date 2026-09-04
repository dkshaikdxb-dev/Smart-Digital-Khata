import React, { useContext } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { AuthContext } from '../AuthContext';

export default function AdminNoticeScreen() {
  const { signOut } = useContext(AuthContext);
  return (
    <View style={s.container}>
      <Text style={s.title}>Admin account</Text>
      <Text style={s.body}>
        This app is for shop owners. Please use the web admin console to manage the platform.
      </Text>
      <Pressable style={s.button} onPress={signOut}>
        <Text style={s.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#0f172a' },
  title: { color: '#e2e8f0', fontSize: 24, fontWeight: '700', marginBottom: 12 },
  body: { color: '#94a3b8', fontSize: 15, lineHeight: 22, marginBottom: 24 },
  button: { backgroundColor: '#334155', padding: 14, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: '#e2e8f0', fontWeight: '700' },
});
