import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, StyleSheet, RefreshControl,
} from 'react-native';
import { colors, sizes } from '../theme';
import { Loading, Empty, Badge, Button } from '../components';
import { publicApi } from '../consumerApi';
import { friendlyError, canRetry } from '../lib/errorText';
import { useT } from '../i18n';
import { useNativeVoice } from '../../lib/useNativeVoice';
import { availabilityLine, isOpen } from '../../lib/shopOpen';

// Quick-browse category chips, mirroring the web directory's CATEGORIES. The
// LABEL is localized; the search TERM stays the English base word, because the
// endpoint matches against a search blob built from English names and
// romanized aliases — sending a translated term would match less, not more.
const CATEGORIES = [
  { key: 'cat.attaRice', term: 'rice', icon: '🍚' },
  { key: 'cat.dairy', term: 'milk', icon: '🧈' },
  { key: 'cat.snacks', term: 'biscuit', icon: '🍪' },
  { key: 'cat.household', term: 'soap', icon: '🧼' },
  { key: 'cat.personalCare', term: 'shampoo', icon: '🧴' },
];

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
  const [retryable, setRetryable] = useState(false);
  // Whether a load has ever COMPLETED. Until it has, an empty list is "still
  // arriving", not "no shops" — the whole point of telling the three states
  // apart.
  const [loaded, setLoaded] = useState(false);
  // Newest request wins. On 2G a search submitted second can easily answer
  // first, and without this the older, wrong result would overwrite it.
  const reqIdRef = useRef(0);
  // The term the visible results are for, so Retry re-runs the right search.
  const lastTermRef = useRef('');

  // OS-native voice search. The mic shows only when this device can recognize
  // speech AND the current language maps to a recognizer locale. Since batch LANG
  // every picker language maps, bn/gu/mr included, so the "not in this language
  // yet" note is the fallback for a language outside the picker rather than the
  // normal path for those three. A handset MISSING the language pack is a
  // different, run-time failure: the hook reports `unavailable` and the hint
  // below says so, instead of leaving a dead button or a spinning mic.
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

  // A NEW search is a loading state, not a silent swap. Before this, load()
  // only ever set `loading` false, so submitting a second search left the FIRST
  // search's results on screen — for the ten to twenty seconds a 2G round trip
  // takes — with nothing to say they were stale. A shopper read them as the
  // answer to what they had just typed.
  //
  // `quiet` is the pull-to-refresh path, where RefreshControl already shows the
  // spinner and blanking the list would be worse than leaving it.
  const load = useCallback(async (term, quiet) => {
    const reqId = reqIdRef.current + 1;
    reqIdRef.current = reqId;
    lastTermRef.current = term || '';
    setError('');
    setRetryable(false);
    if (!quiet) setLoading(true);
    try {
      const r = await publicApi.shops({ search: term, limit: 50, lang });
      if (reqId !== reqIdRef.current) return; // superseded by a newer search
      setShops(r.shops || r.items || []);
      setLoaded(true);
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      // Never the raw message: "Network Error" / "timeout of 15000ms exceeded"
      // is not something a shopper can act on.
      setError(friendlyError(t, err));
      setRetryable(canRetry(err));
      setShops([]);
    } finally {
      if (reqId === reqIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [lang, t]);

  useEffect(() => { load(''); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(search, true); };

  const goProducts = (term) => {
    const q = String(term || '').trim();
    if (!q) return;
    navigation.navigate('ProductSearch', { q });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
    >
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>{t('shops.heroTitle')}</Text>

        {/* Find an ITEM, not a shop. This is the discovery path that makes a
            storefront worth opening — "who near me sells Surf Excel?" — and it
            sits above the directory search because it is the question shoppers
            actually arrive with. Mirrors the web directory's product bar. */}
        <Pressable
          onPress={() => navigation.navigate('ProductSearch', {})}
          style={({ pressed }) => [styles.productBar, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={t('psearch.placeholder')}
        >
          <Text style={styles.searchIcon}>🔍</Text>
          <Text style={styles.productBarText} numberOfLines={1}>{t('psearch.placeholder')}</Text>
        </Pressable>

        <View style={styles.cats}>
          {CATEGORIES.map((c) => (
            <Pressable
              key={c.key}
              onPress={() => goProducts(c.term)}
              style={({ pressed }) => [styles.cat, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.catIcon}>{c.icon}</Text>
              <Text style={styles.catLabel} numberOfLines={2}>{t(c.key)}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionLabel}>{t('shops.heading')}</Text>
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

      {/* THREE states, three different screens.
          FAILED used to render as ErrorBanner + the empty illustration, so a
          load that died on 2G told the shopper "No shops found" — the app
          reporting an absence it had not actually established. Now a failure is
          its own card, says what went wrong in words, and offers the retry. */}
      {error ? (
        <View style={styles.errCard}>
          <Text style={styles.errIcon}>⚠️</Text>
          <Text style={styles.errTitle}>{t('shops.failedTitle')}</Text>
          <Text style={styles.errText}>{error}</Text>
          {retryable ? (
            <Button title={t('common.retry')} onPress={() => load(lastTermRef.current)} style={styles.errBtn} />
          ) : null}
        </View>
      ) : loading ? (
        <Loading text={loaded ? t('shops.searching') : t('shops.loading')} />
      ) : loaded && shops.length === 0 ? (
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
  sectionLabel: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 20, marginBottom: 10 },
  productBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 14,
    minHeight: sizes.tap,
  },
  productBarText: { flex: 1, color: colors.textMuted, fontSize: 16 },
  cats: { flexDirection: 'row', gap: 8, marginTop: 12 },
  cat: {
    flex: 1,
    minHeight: sizes.tap,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: sizes.radius,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catIcon: { fontSize: 22 },
  catLabel: { color: colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: 4 },
  errCard: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: sizes.radius,
    padding: sizes.pad,
    alignItems: 'center',
    marginBottom: sizes.gap,
  },
  errIcon: { fontSize: 34, marginBottom: 8 },
  errTitle: { color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  errText: { color: '#fecaca', fontSize: 15, textAlign: 'center', marginTop: 6 },
  errBtn: { marginTop: 14, alignSelf: 'stretch' },
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
  // 44px minimum on both: these are how a shopper corrects or re-runs a
  // search, and 32/36px squares are a miss on a cheap screen with dry hands.
  clearBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  clearText: { color: colors.textMuted, fontSize: 18 },
  micBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
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
