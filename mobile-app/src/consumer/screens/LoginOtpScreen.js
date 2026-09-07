import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform,
  TextInput, Pressable, Modal, ActivityIndicator,
} from 'react-native';
import { colors, sizes } from '../theme';
import { ErrorBanner } from '../components';
import { consumerAuth } from '../consumerApi';
import { useConsumerAuth } from '../ConsumerAuthContext';
import { useT, LANGUAGES, isBetaLang } from '../i18n';

// Priority 1 — OTP auth. Step 1: enter phone -> request-otp. Step 2: enter the
// 6-digit code -> verify-otp -> store token -> signed in. Mirrors c/login.js
// (field name is `code`, response is { token, customer_user }). dev_code is
// echoed by the backend only outside production / for allow-listed demo numbers.
//
// UI: "Illustrated Bharat" — a kirana shopfront drawn from plain RN Views (no
// SVG, no images, no gradient lib), a language pill, a +91 phone field, and a
// shared 6-box OTP entry driven by one overlaid hidden TextInput. The auth
// calls below are unchanged.
const RESEND_SECONDS = 30;

export default function LoginOtpScreen() {
  const { t, lang, setLang } = useT();
  const { signIn } = useConsumerAuth();
  const [step, setStep] = useState('phone'); // 'phone' | 'code'
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const [resendKey, setResendKey] = useState(0);
  const codeInputRef = useRef(null);

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

  // 30s resend countdown — resets when we enter the code step and each resend.
  useEffect(() => {
    if (step !== 'code') return undefined;
    setSeconds(RESEND_SECONDS);
    const id = setInterval(() => {
      setSeconds((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [step, resendKey]);

  function changeNumber() {
    setStep('phone');
    setCode('');
    setError('');
    setDevCode('');
  }

  function resend() {
    setResendKey((k) => k + 1);
    requestOtp();
  }

  const currentLang = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];
  const canSend = phone.trim().length >= 10;
  const canVerify = code.length === 6;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 'phone' ? (
          <>
            {/* Illustrated top band: language pill + kirana shopfront */}
            <View style={styles.band}>
              <View style={styles.bandTopRow}>
                <Pressable
                  style={styles.langPill}
                  onPress={() => setLangOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={currentLang.label}
                >
                  <View style={styles.globe}>
                    <View style={styles.globeH} />
                    <View style={styles.globeV} />
                  </View>
                  <Text style={styles.langPillText}>{currentLang.label}</Text>
                  <View style={styles.pillCaret} />
                </Pressable>
              </View>

              <Shopfront />
            </View>

            <Text style={styles.heroTitle}>{t('login.heroTitle')}</Text>
            <Text style={styles.heroSub}>{t('login.heroSub')}</Text>

            <Text style={styles.fieldLabel}>{t('login.mobile')}</Text>
            <View style={styles.phoneField}>
              <View style={styles.prefix}>
                <Text style={styles.prefixText}>+91</Text>
              </View>
              <View style={styles.prefixDivider} />
              <TextInput
                style={styles.phoneInput}
                value={phone}
                onChangeText={setPhone}
                placeholder="98765 43210"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                autoCapitalize="none"
                maxLength={14}
              />
            </View>

            <ErrorBanner>{error}</ErrorBanner>

            <Pressable
              onPress={requestOtp}
              disabled={!canSend || loading}
              style={({ pressed }) => [
                styles.cta,
                (!canSend || loading) && styles.ctaDisabled,
                pressed && canSend && !loading && styles.ctaPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('login.sendCode')}
            >
              {loading ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <View style={styles.ctaInner}>
                  <WhatsAppMark />
                  <Text style={styles.ctaText}>{t('login.sendCode')}</Text>
                </View>
              )}
            </Pressable>

            {/* Made for Bharat footer */}
            <View style={styles.footer}>
              <View style={styles.flag}>
                <View style={[styles.flagStripe, { backgroundColor: colors.warn }]} />
                <View style={[styles.flagStripe, { backgroundColor: '#e2e8f0' }]} />
                <View style={[styles.flagStripe, { backgroundColor: colors.accent }]} />
              </View>
              <Text style={styles.footerText}>{t('login.madeForBharat')}</Text>
            </View>
          </>
        ) : (
          <>
            {/* Code step */}
            <View style={styles.codeHeader}>
              <Pressable
                onPress={changeNumber}
                style={styles.backBtn}
                accessibilityRole="button"
                accessibilityLabel={t('common.back')}
              >
                <View style={styles.backChevron} />
              </Pressable>
              <Text style={styles.codeHeaderTitle}>{t('login.verifyTitle')}</Text>
              <View style={styles.backBtn} />
            </View>

            <View style={styles.envWrap}>
              <View style={styles.envBadge}>
                <View style={styles.envBody} />
                <View style={styles.envFlap} />
              </View>
            </View>

            <Text style={styles.enterTitle}>{t('login.enterCodeTitle')}</Text>
            <Text style={styles.sentLine}>
              {t('login.enterCode', { phone: maskPhone(phone) })}
              {'  ·  '}
              <Text style={styles.changeLink} onPress={changeNumber}>
                {t('login.changeNumber')}
              </Text>
            </Text>

            {/* 6-box OTP driven by one overlaid hidden TextInput */}
            <Pressable
              style={styles.otpRow}
              onPress={() => codeInputRef.current && codeInputRef.current.focus()}
            >
              {[0, 1, 2, 3, 4, 5].map((i) => {
                const ch = code[i] || '';
                const isActive = i === code.length || (code.length === 6 && i === 5);
                return (
                  <View
                    key={i}
                    style={[styles.otpBox, (ch || isActive) && styles.otpBoxActive]}
                  >
                    <Text style={styles.otpChar}>{ch}</Text>
                  </View>
                );
              })}
              <TextInput
                ref={codeInputRef}
                style={styles.hiddenInput}
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                caretHidden
              />
            </Pressable>

            {devCode ? (
              <Text style={styles.devCode}>
                {t('login.devCode')} <Text style={styles.devCodeStrong}>{devCode}</Text>
              </Text>
            ) : null}

            <ErrorBanner>{error}</ErrorBanner>

            <Pressable
              onPress={verifyOtp}
              disabled={!canVerify || loading}
              style={({ pressed }) => [
                styles.cta,
                (!canVerify || loading) && styles.ctaDisabled,
                pressed && canVerify && !loading && styles.ctaPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('login.verify')}
            >
              {loading ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.ctaText}>{t('login.verify')}</Text>
              )}
            </Pressable>

            <View style={styles.resendRow}>
              {seconds > 0 ? (
                <Text style={styles.resendWait}>{t('login.resendIn', { sec: seconds })}</Text>
              ) : (
                <Pressable onPress={resend} disabled={loading}>
                  <Text style={styles.resendLink}>{t('login.resend')}</Text>
                </Pressable>
              )}
            </View>

            <Text style={styles.validity}>{t('login.codeValidity')}</Text>
          </>
        )}
      </ScrollView>

      {/* Language selector */}
      <Modal
        visible={langOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLangOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setLangOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <Text style={styles.modalTitle}>{t('account.language')}</Text>
            <ScrollView style={styles.modalList}>
              {LANGUAGES.map((l) => {
                const selected = l.code === lang;
                const label = `${l.label}${isBetaLang(l.code) ? t('login.betaSuffix') : ''}`;
                return (
                  <Pressable
                    key={l.code}
                    style={[styles.langRow, selected && styles.langRowSelected]}
                    onPress={() => { setLang(l.code); setLangOpen(false); }}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                  >
                    <Text style={styles.langRowText}>{label}</Text>
                    {selected ? <View style={styles.langTick} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// Mask a phone to its last 2 digits, e.g. "+91 ••••••10".
function maskPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length <= 2) return `+91 ${d}`;
  return `+91 ${'•'.repeat(d.length - 2)}${d.slice(-2)}`;
}

// A tidy little kirana shopfront, drawn entirely from Views: a striped awning
// over a "KIRANA" board, three shutter panels, a green check badge and a small
// chat/code bubble. Reads as "a shop" — deliberately not pixel-perfect.
function Shopfront() {
  return (
    <View style={styles.shop}>
      <View style={styles.awning}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[
              styles.awningStripe,
              { backgroundColor: i % 2 === 0 ? colors.accent : '#16a34a' },
            ]}
          />
        ))}
      </View>
      <View style={styles.board}>
        <Text style={styles.boardText}>KIRANA</Text>
      </View>
      <View style={styles.shutters}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.shutter}>
            <View style={styles.shutterLine} />
            <View style={styles.shutterLine} />
            <View style={styles.shutterLine} />
          </View>
        ))}
      </View>
      {/* green check badge */}
      <View style={styles.checkBadge}>
        <View style={styles.checkMark} />
      </View>
      {/* chat / code bubble */}
      <View style={styles.chatBubble}>
        <View style={styles.chatDots}>
          <View style={styles.chatDot} />
          <View style={styles.chatDot} />
          <View style={styles.chatDot} />
        </View>
        <View style={styles.chatTail} />
      </View>
    </View>
  );
}

// A small WhatsApp-ish chat bubble mark for the green CTA.
function WhatsAppMark() {
  return (
    <View style={styles.waMark}>
      <View style={styles.waTail} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: sizes.pad, paddingTop: 24, paddingBottom: 40 },

  // ---- Illustrated top band ----
  band: {
    backgroundColor: '#132a1e',
    borderRadius: 20,
    padding: 16,
    marginBottom: 22,
    overflow: 'hidden',
  },
  bandTopRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.55)',
    borderColor: 'rgba(148,163,184,0.35)',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  globe: {
    width: 15, height: 15, borderRadius: 8,
    borderWidth: 1.4, borderColor: colors.text,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  globeH: { position: 'absolute', width: 13, height: 1.2, backgroundColor: colors.text },
  globeV: { position: 'absolute', width: 7, height: 13, borderRadius: 4, borderWidth: 1.2, borderColor: colors.text },
  langPillText: { color: colors.text, fontSize: 13, fontWeight: '700', marginLeft: 7 },
  pillCaret: {
    width: 6, height: 6, marginLeft: 7, marginTop: -3,
    borderRightWidth: 1.6, borderBottomWidth: 1.6, borderColor: colors.textMuted,
    transform: [{ rotate: '45deg' }],
  },

  // ---- Shopfront ----
  shop: { alignItems: 'center', marginTop: 6, paddingBottom: 6 },
  awning: {
    flexDirection: 'row', width: 190, height: 22,
    borderTopLeftRadius: 8, borderTopRightRadius: 8, overflow: 'hidden',
  },
  awningStripe: { flex: 1, height: '100%' },
  board: {
    width: 170, height: 40, backgroundColor: '#0b1220',
    borderColor: '#26344a', borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  boardText: { color: colors.accent, fontSize: 18, fontWeight: '800', letterSpacing: 3 },
  shutters: { flexDirection: 'row', gap: 8, marginTop: 10 },
  shutter: {
    width: 50, height: 56, backgroundColor: '#0b1220',
    borderColor: '#26344a', borderWidth: 1, borderRadius: 6,
    justifyContent: 'center', paddingHorizontal: 6, gap: 6,
  },
  shutterLine: { height: 1, backgroundColor: 'rgba(148,163,184,0.35)' },
  checkBadge: {
    position: 'absolute', top: 26, right: 34,
    width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  checkMark: {
    width: 8, height: 14, marginTop: -2,
    borderRightWidth: 3, borderBottomWidth: 3, borderColor: colors.onAccent,
    transform: [{ rotate: '45deg' }],
  },
  chatBubble: {
    position: 'absolute', top: 30, left: 30,
    backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1,
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 7,
  },
  chatDots: { flexDirection: 'row', gap: 4 },
  chatDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accent },
  chatTail: {
    position: 'absolute', bottom: -5, left: 8,
    width: 0, height: 0,
    borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 6,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#1e293b',
  },

  // ---- Copy ----
  heroTitle: { color: colors.text, fontSize: 24, fontWeight: '800', marginBottom: 8, lineHeight: 30 },
  heroSub: { color: colors.textMuted, fontSize: 15, lineHeight: 22, marginBottom: 22 },

  // ---- Phone field ----
  fieldLabel: { color: colors.textMuted, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  phoneField: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0b1220', borderColor: '#26344a', borderWidth: 1,
    borderRadius: 14, height: 56, paddingHorizontal: 6,
  },
  prefix: { paddingHorizontal: 10, justifyContent: 'center' },
  prefixText: { color: colors.text, fontSize: 17, fontWeight: '700' },
  prefixDivider: { width: 1, height: 26, backgroundColor: '#26344a', marginRight: 8 },
  phoneInput: { flex: 1, color: colors.text, fontSize: 18, height: '100%', paddingRight: 8 },

  // ---- Green CTA ----
  cta: {
    backgroundColor: colors.accent, borderRadius: 15, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center', marginTop: 16, minHeight: 56,
  },
  ctaInner: { flexDirection: 'row', alignItems: 'center' },
  ctaDisabled: { opacity: 0.5 },
  ctaPressed: { opacity: 0.85 },
  ctaText: { color: colors.onAccent, fontSize: 17, fontWeight: '800' },

  // WhatsApp mark
  waMark: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: '#ffffff', marginRight: 10,
  },
  waTail: {
    position: 'absolute', bottom: -2, left: 2,
    width: 0, height: 0,
    borderLeftWidth: 5, borderRightWidth: 2, borderTopWidth: 6,
    borderLeftColor: '#ffffff', borderRightColor: 'transparent', borderTopColor: '#ffffff',
    transform: [{ rotate: '10deg' }],
  },

  // ---- Made for Bharat footer ----
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  flag: {
    width: 22, height: 15, borderRadius: 2, overflow: 'hidden', marginRight: 8,
    borderColor: 'rgba(148,163,184,0.35)', borderWidth: StyleSheet.hairlineWidth,
  },
  flagStripe: { flex: 1, width: '100%' },
  footerText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },

  // ---- Code step ----
  codeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backChevron: {
    width: 12, height: 12, marginLeft: 4,
    borderLeftWidth: 2.5, borderBottomWidth: 2.5, borderColor: colors.text,
    transform: [{ rotate: '45deg' }],
  },
  codeHeaderTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },

  envWrap: { alignItems: 'center', marginTop: 18, marginBottom: 16 },
  envBadge: {
    width: 72, height: 72, borderRadius: 20, backgroundColor: 'rgba(34,197,94,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  envBody: {
    width: 40, height: 28, borderRadius: 4,
    backgroundColor: '#0b1220', borderColor: colors.accent, borderWidth: 2,
  },
  envFlap: {
    position: 'absolute', top: 22,
    width: 0, height: 0,
    borderLeftWidth: 20, borderRightWidth: 20, borderTopWidth: 15,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: colors.accent,
  },

  enterTitle: { color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  sentLine: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 22 },
  changeLink: { color: colors.accent, fontWeight: '700' },

  // ---- 6-box OTP ----
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', position: 'relative' },
  otpBox: {
    width: 48, height: 58, borderRadius: 12,
    backgroundColor: '#0b1220', borderColor: '#26344a', borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  otpBoxActive: { borderColor: colors.accent },
  otpChar: { color: colors.text, fontSize: 24, fontWeight: '800' },
  hiddenInput: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    opacity: 0, color: 'transparent',
  },

  devCode: { color: colors.warn, fontSize: 15, marginTop: 16, textAlign: 'center' },
  devCodeStrong: { fontWeight: '800' },

  resendRow: { alignItems: 'center', marginTop: 16, minHeight: 24 },
  resendWait: { color: colors.textMuted, fontSize: 14 },
  resendLink: { color: colors.accent, fontSize: 15, fontWeight: '800' },
  validity: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 14 },

  // ---- Language modal ----
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 28, maxHeight: '70%',
  },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 12 },
  modalList: { flexGrow: 0 },
  langRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 14, borderRadius: 12, marginBottom: 6,
    backgroundColor: colors.cardAlt,
  },
  langRowSelected: { borderColor: colors.accent, borderWidth: 1.5 },
  langRowText: { color: colors.text, fontSize: 17, fontWeight: '600' },
  langTick: {
    width: 8, height: 14,
    borderRightWidth: 2.5, borderBottomWidth: 2.5, borderColor: colors.accent,
    transform: [{ rotate: '45deg' }], marginTop: -3,
  },
});
