import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, sizes } from '../theme';
import { Card, ErrorBanner, Loading, Empty } from '../components';
import { money, spokenBalance } from '../money';
import { my } from '../consumerApi';
import { useT } from '../i18n';
import { useNativeVoice } from '../../lib/useNativeVoice';

// Priority 2 (core value) — cross-shop khata from GET /my/khata.
// balance is INTEGER PAISE: > 0 means the customer OWES, < 0 means advance.
export default function KhataScreen({ navigation }) {
  const { t, lang } = useT();

  // Read a balance out loud.
  //
  // This is the one screen where a shopper who cannot read still has to know a
  // number exactly, and the web PWA has spoken it for a while (pages/c/khata.js)
  // while the app — the thing most of them actually use — did not, even though
  // expo-speech was already wired up in useNativeVoice for the owner's order
  // alert. Same sentence, same dictionary keys, so a shopper hears the same
  // words whichever surface they are on.
  //
  // It can be STOPPED. The web version cannot be, which was raised as a bug:
  // a voice reading a balance out loud in a shop is something you need to be
  // able to cut off immediately, and there is no way to do that if the only
  // control starts it. While speaking, the button becomes Stop.
  // WHICH row is being read, not merely THAT something is. `voice.speaking` is
  // one flag for the whole hook, so keying the control off it alone turned every
  // row's button into Stop at once: a shopper could not start reading the second
  // shop without stopping the first, and three Stop buttons implied three things
  // were talking. Only the row actually being read becomes Stop; the others stay
  // Play, and tapping one of those switches to it (speak() replaces rather than
  // queues, so nothing talks over anything).
  const voice = useNativeVoice(lang);
  const [speakingId, setSpeakingId] = useState('');
  const isSaying = (shopId) => voice.speaking && speakingId === shopId;

  const sayBalance = (s) => {
    if (isSaying(s.shop_id)) { voice.stopSpeaking(); setSpeakingId(''); return; }
    setSpeakingId(s.shop_id);
    voice.speak(spokenBalance(t, s));
  };
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await my.khata();
      setData(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload every time the tab regains focus (e.g. after a payment).
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const total = data ? Number(data.total_outstanding || 0) : 0;
  const shops = data ? (data.shops || []) : [];

  // total_outstanding can be negative (a net advance across shops). Mirror the
  // per-shop rows: pick the owe / advance / settled word by sign and always show
  // an absolute amount, so a net advance never renders as "₹-50.00 outstanding".
  const totalOwes = total > 0;
  const totalAdvance = total < 0;
  const totalWord = totalOwes ? t('khata.owe') : totalAdvance ? t('khata.advance') : t('khata.settled');
  const totalTone = totalOwes ? colors.danger : totalAdvance ? colors.accent : colors.textMuted;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
    >
      <ErrorBanner>{error}</ErrorBanner>

      {loading && !data ? (
        <Loading text={t('khata.loading')} />
      ) : (
        <>
          <Card style={styles.totalCard}>
            <Text style={styles.totalLabel}>{totalWord}</Text>
            <Text style={[styles.totalValue, { color: totalTone }]}>
              {money(Math.abs(total))}
            </Text>
          </Card>

          {shops.length === 0 && !error ? (
            <Empty icon="📒" text={t('khata.none')} />
          ) : null}

          {shops.map((s) => {
            const bal = Number(s.balance);
            const owes = bal > 0;
            const advance = bal < 0;
            const word = owes ? t('khata.owe') : advance ? t('khata.advance') : t('khata.settled');
            const tone = owes ? colors.danger : advance ? colors.accent : colors.textMuted;
            return (
              <Pressable
                key={s.shop_id}
                onPress={() => navigation.navigate('ShopKhata', { shopId: s.shop_id, shopName: s.shop_name })}
                style={({ pressed }) => [styles.shopRow, pressed && styles.pressed]}
              >
                <View style={styles.shopInfo}>
                  <Text style={styles.shopName}>{s.shop_name}</Text>
                  <Text style={[styles.shopWord, { color: tone }]}>{word}</Text>
                  {s.credit_limit != null && Number(s.credit_limit) > 0 ? (
                    <Text style={styles.limit}>{t('khata.limitSuffix', { amt: money(s.credit_limit) })}</Text>
                  ) : null}
                </View>
                <View style={styles.shopRight}>
                  <Text style={[styles.shopBal, { color: tone }]}>{money(Math.abs(bal))}</Text>
                  {/* Gated on ttsSupported, NOT `supported` — that one is
                      speech RECOGNITION, a different capability. Hidden
                      entirely when the device cannot speak, rather than
                      offering a button that does nothing. */}
                  {voice.ttsSupported ? (
                    <Pressable
                      onPress={() => sayBalance(s)}
                      hitSlop={8}
                      style={styles.speakBtn}
                      accessibilityRole="button"
                      accessibilityLabel={isSaying(s.shop_id) ? t('common.stop') : `${t('voice.speak')} · ${s.shop_name}`}
                    >
                      <Text style={styles.speakIcon}>{isSaying(s.shop_id) ? '⏹' : '🔊'}</Text>
                    </Pressable>
                  ) : null}
                  <Text style={styles.chev}>›</Text>
                </View>
              </Pressable>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: sizes.pad },
  // A real target: this sits inside a row that navigates, so a near-miss must
  // not open the shop's statement instead of reading the balance.
  speakBtn: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 4,
  },
  speakIcon: { fontSize: 20 },
  totalCard: { alignItems: 'center', paddingVertical: 22 },
  totalLabel: { color: colors.textMuted, fontSize: 15 },
  totalValue: { fontSize: sizes.big, fontWeight: '800', marginTop: 6 },
  shopRow: {
    backgroundColor: colors.card,
    borderRadius: sizes.radius,
    padding: sizes.pad,
    marginBottom: sizes.gap,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pressed: { opacity: 0.85 },
  shopInfo: { flex: 1, paddingRight: 12 },
  shopName: { color: colors.text, fontSize: 18, fontWeight: '700' },
  shopWord: { fontSize: 14, marginTop: 4, fontWeight: '600' },
  limit: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  shopRight: { flexDirection: 'row', alignItems: 'center' },
  shopBal: { fontSize: 20, fontWeight: '800' },
  chev: { color: colors.textMuted, fontSize: 28, marginLeft: 8 },
});
