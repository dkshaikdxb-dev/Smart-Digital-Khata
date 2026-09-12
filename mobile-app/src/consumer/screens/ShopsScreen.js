import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, StyleSheet, RefreshControl,
} from 'react-native';
import { colors, sizes } from '../theme';
import { ErrorBanner, Loading, Empty, Badge } from '../components';
import { publicApi } from '../consumerApi';
import { useT } from '../i18n';
import { useNativeVoice } from '../../lib/useNativeVoice';
import { availabilityLine, isOpen } from '../../lib/shopOpen';

// Priority 3 — public shop directory from GET /public/shops. Search by name/city
// (server matches either). GPS is intentionally NOT used here: no location
// permission and no extra dependency; the search box is the whole discovery UX,
// which degrades gracefully everywhere.
//
// Presented as a lightweight storefront: a hero header + search field, then shop
// results as tidy cards (avatar, name, area/city, an item-count chip and a
// delivery/distance chip, chevron CTA). Big tap targets for low-literacy users;
// no images to keep it fast on 2G.

// First letter of the shop name for the avatar; falls back to a shop glyph.
function initial(name) {
  const s = String(name || '').trim();
  return s ? s[0].toUpperCase() : '🏪';
}

export default function ShopsScreen({ navigation }) {
  const { t, lang } = useT();
  const [search, setSearch] = useState('');
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // OS-native voice search. The mic shows only when this device can recognize
  // speech AND the current language maps to a recognizer locale; bn/gu/mr get an
  // honest "not in this language yet" note instead of a dead button.
  const voice = useNativeVoice(lang);
  const canVoice = voice.supported && voice.localeSupported(lang);
  const showLangNote = voice.supported && !voice.localeSupported(lang);
  const [voiceHint, setVoiceHint] = useState('');

  // Surface the hook's mapped error as a localized, auto-clearing hint.
  useEffect(() => {
    if (!voice.lastError) return undefined;
    setVoiceHint(t(`voice.hint.${voice.lastError}`));
    const timer = setTimeout(() => setVoiceHint(''), 5000);
    return () => clearTimeout(timer);
  }, [voice.lastError, t]);

  const startVoice = () => {
    setVoiceHint('');
    voice.listen((transcript) => {
      setSearch(transcript);
      load(transcript);
    });
  };

  const load = useCallback(async (term) => {
    setError('');
    try {
      const r = await publicApi.shops({ search: term, limit: 50, lang });
      setShops(r.shops || r.items || []);
    } catch (err) {
      setError(err.message);
      setShops([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [lang]);

  useEffect(() => { load(''); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(search); };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
    >
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>{t('shops.heading')}</Text>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('shops.searchPlaceholder')}
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            returnKeyType="search"
            onSubmitEditing={() => load(search)}
          />
          {search ? (
            <Pressable onPress={() => { setSearch(''); load(''); }} style={styles.clearBtn} accessibilityLabel={t('common.close')}>
              <Text style={styles.clearText}>✕</Text>
            </Pressable>
          ) : null}
          {canVoice ? (
            <Pressable
              onPress={voice.listening ? voice.stop : startVoice}
              style={styles.micBtn}
              accessibilityRole="button"
              accessibilityLabel={t('voice.search')}
            >
              <Text style={[styles.micText, voice.listening && styles.micTextActive]}>🎤</Text>
            </Pressable>
          ) : null}
        </View>
        {voice.listening ? (
          <Text style={styles.voiceListening}>{t('voice.listening')}</Text>
        ) : voiceHint ? (
          <Text style={styles.voiceHint}>{voiceHint}</Text>
        ) : showLangNote ? (
          <Text style={styles.voiceHint}>{t('voice.notInLanguage')}</Text>
        ) : null}
      </View>

      <ErrorBanner>{error}</ErrorBanner>

      {loading ? (
        <Loading text={t('shops.loading')} />
      ) : shops.length === 0 && !error ? (
        <Empty icon="🏪" text={t('shops.none')} />
      ) : (
        shops.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => navigation.navigate('ShopDetail', { shopId: s.id, shopName: s.name })}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial(s.name)}</Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.name} numberOfLines={1}>{s.name}</Text>
              <Text style={styles.loc} numberOfLines={1}>
                {[s.area, s.city].filter(Boolean).join(', ') || t('shops.noLocation')}
              </Text>
              <View style={styles.meta}>
                {/* Shop availability (batch A): a closed shop is still LISTED
                    and still openable — the API sorts it after the open ones —
                    but the card says so up front, with the reopen hint, so the
                    pill is never a bare "Closed". */}
                {!isOpen(s.availability) ? <Badge tone="warn">{t('open.closedPill')}</Badge> : null}
                <Badge>{t('shops.itemsCount', { n: Number(s.product_count || 0) })}</Badge>
                {s.distance_km != null ? <Badge>{t('shops.kmAway', { km: s.distance_km })}</Badge> : null}
                {s.offers_delivery ? <Badge tone="ok">🛵 {t('shopdetail.delivery')}</Badge> : null}
              </View>
              {!isOpen(s.availability) ? (
                <Text style={styles.closedHint} numberOfLines={2}>
                  {availabilityLine(t, s.availability, lang)}
                </Text>
              ) : null}
            </View>
            <Text style={styles.chev}>›</Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: sizes.pad },
  hero: { marginBottom: sizes.gap },
  heroTitle: { color: colors.text, fontSize: sizes.title, fontWeight: '800', marginBottom: 12 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    minHeight: sizes.tap,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 8 },
  clearBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  clearText: { color: colors.textMuted, fontSize: 16 },
  micBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  micText: { fontSize: 18, opacity: 0.75 },
  micTextActive: { opacity: 1 },
  voiceListening: { color: colors.accent, fontSize: 13, marginTop: 8, marginLeft: 6 },
  voiceHint: { color: colors.textMuted, fontSize: 13, marginTop: 8, marginLeft: 6 },
  card: {
    backgroundColor: colors.card,
    borderRadius: sizes.radius,
    padding: sizes.pad,
    marginBottom: sizes.gap,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pressed: { opacity: 0.85 },
  avatar: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: colors.cardAlt,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: { color: colors.accent, fontSize: 22, fontWeight: '800' },
  info: { flex: 1 },
  name: { color: colors.text, fontSize: 18, fontWeight: '700' },
  loc: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  meta: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  closedHint: { color: colors.textMuted, fontSize: 13, marginTop: 6 },
  chev: { color: colors.textMuted, fontSize: 28, marginLeft: 8 },
});
