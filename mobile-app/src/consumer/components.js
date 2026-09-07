import React from 'react';
import {
  View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet,
} from 'react-native';
import { colors, sizes } from './theme';

// Shared, large-tap-target building blocks so every consumer screen looks and
// behaves the same. Kept deliberately small and dependency-free.

export function Card({ style, children }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({ title, onPress, disabled, loading, variant = 'primary', style }) {
  const isSecondary = variant === 'secondary';
  const isDanger = variant === 'danger';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        isSecondary && styles.btnSecondary,
        isDanger && styles.btnDanger,
        (disabled || loading) && styles.btnDisabled,
        pressed && !disabled && !loading && styles.btnPressed,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      {loading ? (
        <ActivityIndicator color={isSecondary ? colors.text : colors.onAccent} />
      ) : (
        <Text style={[styles.btnText, (isSecondary || isDanger) && styles.btnTextLight]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({ label, hint, ...props }) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        {...props}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function ErrorBanner({ children }) {
  if (!children) return null;
  return (
    <View style={styles.errBox}>
      <Text style={styles.errText}>{children}</Text>
    </View>
  );
}

export function Loading({ text }) {
  return (
    <View style={styles.loadingBox}>
      <ActivityIndicator size="large" color={colors.accent} />
      {text ? <Text style={styles.loadingText}>{text}</Text> : null}
    </View>
  );
}

export function Empty({ icon, text, children }) {
  return (
    <View style={styles.emptyBox}>
      {icon ? <Text style={styles.emptyIcon}>{icon}</Text> : null}
      <Text style={styles.emptyText}>{text}</Text>
      {children}
    </View>
  );
}

export function Badge({ children, tone }) {
  const toneStyle =
    tone === 'ok' ? styles.badgeOk : tone === 'danger' ? styles.badgeDanger :
    tone === 'warn' ? styles.badgeWarn : null;
  return (
    <View style={[styles.badge, toneStyle]}>
      <Text style={styles.badgeText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: sizes.radius,
    padding: sizes.pad,
    marginBottom: sizes.gap,
  },
  btn: {
    backgroundColor: colors.accent,
    minHeight: sizes.tap,
    borderRadius: sizes.radius,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    flexDirection: 'row',
  },
  btnSecondary: { backgroundColor: colors.border },
  btnDanger: { backgroundColor: colors.danger },
  btnDisabled: { opacity: 0.5 },
  btnPressed: { opacity: 0.85 },
  btnText: { color: colors.onAccent, fontWeight: '800', fontSize: sizes.body },
  btnTextLight: { color: colors.text },
  field: { marginBottom: sizes.gap },
  label: { color: colors.textMuted, fontSize: 14, marginBottom: 6, fontWeight: '600' },
  input: {
    backgroundColor: colors.cardAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: sizes.radius,
    color: colors.text,
    fontSize: 18,
    paddingHorizontal: 14,
    minHeight: sizes.tap,
  },
  hint: { color: colors.textMuted, fontSize: 13, marginTop: 6 },
  errBox: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: sizes.radius,
    padding: 14,
    marginBottom: sizes.gap,
  },
  errText: { color: '#fecaca', fontSize: 15 },
  loadingBox: { padding: 32, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: colors.textMuted, marginTop: 12, fontSize: 15 },
  emptyBox: { padding: 28, alignItems: 'center' },
  emptyIcon: { fontSize: 44, marginBottom: 10 },
  emptyText: { color: colors.textMuted, fontSize: 16, textAlign: 'center', marginBottom: 14 },
  badge: {
    backgroundColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  badgeOk: { backgroundColor: 'rgba(34,197,94,0.2)' },
  badgeDanger: { backgroundColor: 'rgba(239,68,68,0.2)' },
  badgeWarn: { backgroundColor: 'rgba(245,158,11,0.2)' },
  badgeText: { color: colors.text, fontSize: 13, fontWeight: '600' },
});
