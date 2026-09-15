import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, StyleSheet,
} from 'react-native';
import { colors, sizes } from '../theme';
import { Button, Badge } from '../components';
import ProductThumb from '../components/ProductThumb';
import { money } from '../money';
import { publicApi, my, getToken } from '../consumerApi';
import { friendlyError, canRetry, isCancelled } from '../lib/errorText';
import { useT, LANGUAGES } from '../i18n';
import { useNativeVoice } from '../../lib/useNativeVoice';
import { availabilityLine, isOpen } from '../../lib/shopOpen';
import { CATEGORIES, categoryByKey } from '../lib/categories';
import {
  loadRecentSearches, rememberSearch, clearRecentSearches,
} from '../lib/recentSearchStorage';

// P4 — cross-shop product search. "Who near me sells Surf Excel?" was
// unanswerable in the app: only shop NAMES were searchable, so a shopper had to
// already know which shop stocked a thing before they could look for it.
//
// Backed by the SAME public endpoint the web PWA's /c/products page uses
// (GET /api/public/products/search), so ranking, fuzzy matching and
// localization are identical on both surfaces rather than reimplemented here.
//
// Built for 2G, which is the only network some of these shoppers have:
//   - typing is debounced (350ms) so a six-letter word is one request, not six;
//   - every superseded request is ABORTED, not merely ignored, so the radio is
//     not kept awake pulling a response nobody will read;
//   - a stale response can never overwrite a newer one (request-id guard);
//   - no image is fetched when data saver is on — ProductThumb handles that,
//     and the emoji it falls back to still says what the item is.
//
// Four states, four different screens: nothing searched yet, searching, failed
// (with a retry, because a dropped 2G request usually succeeds second time),
// and searched-but-nothing-found. "Failed" must never look like "empty" — that
// is the bug that tells a shopper a shop has no stock when the request simply
// died.
//
// ---------------------------------------------------------------------------
// WHAT THE SHOPPER SEES BEFORE THEY SEARCH, AND IN WHAT ORDER
//
// 1. The search unit: the text box, and DIRECTLY BENEATH IT a full-width voice
//    control. Not the small mic beside the box that the directory has. Typing
//    is the hardest thing this audience can be asked to do; speaking costs them
//    nothing, needs no letters, and works the very first time they open the
//    app. So it sits highest and it is impossible to miss.
// 2. Buy it again — their own past items, most frequent first. A kirana basket
//    barely changes month to month, so for a returning shopper this is usually
//    the whole journey: one tap.
// 3. Recent searches — their own last few words, stored ON THE HANDSET only.
// 4. Shop by category — always there, the universal fallback, and the section a
//    brand-new shopper will actually use.
//
// THE GOVERNING RULE: this screen must be EXCELLENT when every personal section
// is empty, because a brand-new shopper is the make-or-break case. A section
// with no data renders NOTHING AT ALL — no placeholder, no skeleton, no "you
// have no past orders", which tells someone off for being new. What is left is
// a box, a big microphone and six real shelves, which is a complete screen.

const DEBOUNCE_MS = 350;
// Eight is the cap the brief asks for and about what fits without the chips
// falling off the bottom of a 360dp screen.
const BUY_AGAIN_MAX = 8;

// The language's own name, for the line telling the shopper which language the
// microphone will listen in. It is DATA out of LANGUAGES, not a translated
// string, so it reads correctly in every language including the three with no
// translator yet.
function languageLabel(code) {
  const found = LANGUAGES.find((l) => l.code === code);
  return found ? found.label : '';
}

export default function ProductSearchScreen({ route, navigation }) {
  const { t, lang } = useT();
  const params = route.params || {};
  const initialQ = params.q || '';
  const initialCategory = params.category || '';

  const [q, setQ] = useState(initialQ);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retryable, setRetryable] = useState(false);
  const [searched, setSearched] = useState(false);
  // The shelf currently being browsed ('' when the shopper is searching by
  // word), so the header can name it and Retry can re-run it.
  const [shelf, setShelf] = useState(initialCategory);

  const [buyAgain, setBuyAgain] = useState([]);
  const [recent, setRecent] = useState([]);

  // Monotonic id of the newest request, plus the AbortController of whatever is
  // currently in flight.
  const reqIdRef = useRef(0);
  const abortRef = useRef(null);
  const debounceRef = useRef(null);
  // What the last request was for, so Retry re-runs the right one.
  const lastRef = useRef({ term: initialQ, category: initialCategory });

  // OS-native voice. The control is rendered ONLY when this device can actually
  // recognize speech AND the active language maps to a recognizer locale. When
  // it cannot, nothing is rendered and nothing is said about it: a shopper who
  // cannot use voice is not helped by being told so every time they open the
  // screen, and a control that is going to fail is worse than no control.
  const voice = useNativeVoice(lang);
  const canVoice = voice.supported && voice.localeSupported(lang);
  const [voiceHint, setVoiceHint] = useState('');

  // The hook's mapped error, surfaced as a localized, auto-clearing hint. This
  // one IS shown, because it follows a tap the shopper actually made.
  useEffect(() => {
    if (!voice.lastError) return undefined;
    setVoiceHint(t(`voice.hint.${voice.lastError}`));
    const timer = setTimeout(() => setVoiceHint(''), 5000);
    return () => clearTimeout(timer);
  }, [voice.lastError, t]);

  // `category` runs a real shelf filter; `term` is a word. Either may be empty,
  // and both empty means "back to the browse screen".
  const runSearch = useCallback(async (term, category) => {
    const text = String(term || '').trim();
    const shelfKey = String(category || '');
    lastRef.current = { term: text, category: shelfKey };

    // Whatever was in flight is now superseded — stop paying for it.
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch (e) { /* already settled */ }
      abortRef.current = null;
    }

    if (!text && !shelfKey) {
      reqIdRef.current += 1; // invalidate anything still landing
      setProducts([]);
      setSearched(false);
      setShelf('');
      setError('');
      setRetryable(false);
      setLoading(false);
      return;
    }

    const reqId = reqIdRef.current + 1;
    reqIdRef.current = reqId;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    abortRef.current = controller;

    setLoading(true);
    setError('');
    setRetryable(false);
    setSearched(true);
    setShelf(shelfKey);

    try {
      const chip = shelfKey ? categoryByKey(shelfKey) : null;
      const r = await publicApi.searchProducts({
        q: text || undefined,
        category: shelfKey || undefined,
        // The keyword this chip used before shelves existed. consumerApi only
        // reaches for it when an older server refuses the shelf outright.
        fallbackTerm: chip ? chip.term : undefined,
        lang,
        limit: 30,
        signal: controller ? controller.signal : undefined,
      });
      if (reqId !== reqIdRef.current) return; // a newer search won
      setProducts(r.products || []);
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      if (isCancelled(err)) return; // we aborted it; not a failure to report
      setError(friendlyError(t, err));
      setRetryable(canRetry(err));
      setProducts([]);
    } finally {
      if (reqId === reqIdRef.current) {
        setLoading(false);
        abortRef.current = null;
      }
    }
  }, [lang, t]);

  // Seed from a chip / the directory's product bar and search at once.
  useEffect(() => {
    if (initialQ || initialCategory) runSearch(initialQ, initialCategory);
    // Only for what the screen was opened with; typing is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The two personal sections. Both are best-effort and both are silent about
  // failure: an empty list renders nothing, which is the brand-new-shopper
  // screen, so a 404 from a backend that has not been updated yet, a dead
  // radio, or a keystore that will not open all land on a screen that is still
  // completely usable. Nothing here blocks the first paint.
  useEffect(() => {
    let alive = true;
    loadRecentSearches().then((list) => { if (alive) setRecent(list); });
    (async () => {
      // Signed-in only. Checking the stored token first means a signed-out
      // install never fires an authenticated request at all, so it can never
      // trip the global 401 handler on this screen.
      const token = await getToken();
      if (!token || !alive) return;
      const items = await my.buyAgain(BUY_AGAIN_MAX);
      if (alive) setBuyAgain(Array.isArray(items) ? items : []);
    })();
    return () => { alive = false; };
  }, []);

  // Tear down on unmount: kill the pending timer AND the in-flight request, so
  // leaving the screen mid-search costs nothing more.
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) { try { abortRef.current.abort(); } catch (e) { /* ignore */ } }
    reqIdRef.current += 1;
  }, []);

  // Record a word the shopper actually committed to — submitted, spoken, or
  // re-tapped — never every keystroke on the way there.
  const remember = useCallback((term) => {
    rememberSearch(term).then((list) => setRecent(list));
  }, []);

  function onType(value) {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(value, ''), DEBOUNCE_MS);
  }

  function submitNow() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    remember(q);
    runSearch(q, '');
  }

  function startVoice() {
    setVoiceHint('');
    voice.listen((transcript) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setQ(transcript);
      remember(transcript);
      runSearch(transcript, '');
    });
  }

  // A chip is a SHELF, not a word. The box is left empty on purpose: there is
  // no keyword to show, and putting one there would invite the shopper to edit
  // a term that is not what the results came from.
  function pickCategory(category) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQ('');
    runSearch('', category);
  }

  function pickTerm(term) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQ(term);
    remember(term);
    runSearch(term, '');
  }

  function clearAll() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQ('');
    runSearch('', '');
  }

  function onClearRecent() {
    clearRecentSearches().then((list) => setRecent(list));
  }

  function openShop(shop) {
    navigation.navigate('ShopDetail', { shopId: shop.id, shopName: shop.name });
  }

  const shelfChip = shelf ? categoryByKey(shelf) : null;
  const browsing = !error && !loading && !searched;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* ---- 1. THE SEARCH UNIT: the box, then the voice control ---- */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          value={q}
          onChangeText={onType}
          placeholder={t('psearch.placeholder')}
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          returnKeyType="search"
          autoCorrect={false}
          onSubmitEditing={submitNow}
          accessibilityLabel={t('psearch.placeholder')}
        />
        {q || shelf ? (
          <Pressable onPress={clearAll} style={styles.clearBtn} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <Text style={styles.clearText}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {/* The zero-literacy, zero-data path, and the only control on this screen
          that works for a shopper who cannot read the box above it. Full width,
          tall, and it names the language it will listen in — so someone whose
          app is in Marathi can see it is going to listen in Marathi before they
          spend a breath on it. Rendered only when it will actually work. */}
      {canVoice ? (
        <Pressable
          onPress={voice.listening ? voice.stop : startVoice}
          style={({ pressed }) => [
            styles.voiceBtn,
            voice.listening && styles.voiceBtnActive,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('voice.search')}
        >
          <Text style={styles.voiceIcon}>🎤</Text>
          <View style={styles.voiceTextWrap}>
            <Text style={styles.voiceTitle} numberOfLines={2}>
              {voice.listening ? t('voice.listening') : t('voice.search')}
            </Text>
            <Text style={styles.voiceSub} numberOfLines={1}>
              {t('psearch.voiceIn', { language: languageLabel(lang) })}
            </Text>
          </View>
        </Pressable>
      ) : null}

      {voiceHint ? <Text style={styles.voiceHint}>{voiceHint}</Text> : null}

      {/* ---- the four search states, each visibly its own thing ---- */}

      {/* FAILED: a red-bordered card that names the problem and offers the one
          action that helps. Nothing about it resembles the empty state. */}
      {error ? (
        <View style={styles.errCard}>
          <Text style={styles.errIcon}>⚠️</Text>
          <Text style={styles.errTitle}>{t('psearch.failedTitle')}</Text>
          <Text style={styles.errText}>{error}</Text>
          {retryable ? (
            <Button
              title={t('common.retry')}
              onPress={() => runSearch(lastRef.current.term, lastRef.current.category)}
              style={styles.errBtn}
            />
          ) : null}
        </View>
      ) : null}

      {/* SEARCHING: a live line under the box, so the shopper can see the app is
          working rather than watching an unchanged list for twenty seconds. */}
      {!error && loading ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateIcon}>⏳</Text>
          <Text style={styles.stateText}>{t('psearch.searching')}</Text>
        </View>
      ) : null}

      {/* Browsing a shelf: say which one, since the box is empty. */}
      {!error && !loading && shelfChip ? (
        <Text style={styles.shelfHeading}>
          {shelfChip.icon} {t(shelfChip.key)}
        </Text>
      ) : null}

      {/* SEARCHED, GENUINELY NOTHING */}
      {!error && !loading && searched && products.length === 0 ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateIcon}>🫙</Text>
          <Text style={styles.stateText}>
            {t('psearch.none', { q: shelfChip ? t(shelfChip.key) : String(q).trim() })}
          </Text>
        </View>
      ) : null}

      {/* ---- 2/3/4. The browse surface, shown only before a search ---- */}

      {/* 2. BUY IT AGAIN. Their own items, most frequent first. One tap runs the
             remembered name as a search. NO PRICE is shown and none is
             fetched — a price is a per-shop lookup and this screen is drawn on
             2G. Absent entirely when the list is empty, which is every
             brand-new shopper and every signed-out install. */}
      {browsing && buyAgain.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🧺 {t('psearch.buyAgain')}</Text>
          {buyAgain.map((item, i) => (
            <Pressable
              key={`${item.name}:${item.shop_id || i}`}
              onPress={() => pickTerm(item.name)}
              style={({ pressed }) => [styles.againRow, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`${item.name} · ${item.shop_name || ''}`}
            >
              <Text style={styles.againIcon}>↻</Text>
              <View style={styles.againText}>
                <Text style={styles.againName} numberOfLines={1}>{item.name}</Text>
                {item.shop_name ? (
                  <Text style={styles.againShop} numberOfLines={1}>
                    {t('psearch.atShop', { shop: item.shop_name })}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* 3. RECENT SEARCHES. The shopper's own words, from this handset only —
             no backend, nothing synced. Compact chips, and a Clear. */}
      {browsing && recent.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>🕘 {t('psearch.recent')}</Text>
            <Pressable
              onPress={onClearRecent}
              style={styles.clearRecent}
              accessibilityRole="button"
              accessibilityLabel={t('psearch.clearRecent')}
            >
              <Text style={styles.clearRecentText}>{t('psearch.clearRecent')}</Text>
            </Pressable>
          </View>
          <View style={styles.recentWrap}>
            {recent.map((term) => (
              <Pressable
                key={term}
                onPress={() => pickTerm(term)}
                style={({ pressed }) => [styles.recentChip, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={term}
              >
                <Text style={styles.recentText} numberOfLines={1}>{term}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {/* 4. SHOP BY CATEGORY. Always present. Each chip filters by a REAL
             catalogue shelf, not a guessed keyword — see lib/categories.js for
             what the keywords were actually reaching. */}
      {browsing ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏪 {t('psearch.browse')}</Text>
          <View style={styles.cats}>
            {CATEGORIES.map((c) => (
              <Pressable
                key={c.key}
                onPress={() => pickCategory(c.category)}
                style={({ pressed }) => [styles.cat, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={t(c.key)}
              >
                <Text style={styles.catIcon}>{c.icon}</Text>
                <Text style={styles.catLabel} numberOfLines={2}>{t(c.key)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {!error && !loading && products.map((p) => {
        const shop = p.shop || {};
        const open = isOpen(shop.availability);
        const place = [shop.area, shop.city].filter(Boolean).join(', ');
        return (
          <Pressable
            key={`${shop.id}:${p.id}`}
            onPress={() => openShop(shop)}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`${p.name} · ${money(p.price)} · ${shop.name || ''}`}
          >
            <ProductThumb product={p} size={56} style={styles.thumb} />
            <View style={styles.info}>
              <Text style={styles.name} numberOfLines={2}>{p.name}</Text>
              <Text style={styles.price}>
                {money(p.price)}
                <Text style={styles.per}>
                  {p.sold_by_weight ? ` ${t('shopdetail.perKg')}` : ` ${t('shopdetail.per', { unit: p.unit || t('shopdetail.unit') })}`}
                </Text>
              </Text>
              <Text style={styles.at} numberOfLines={1}>
                {t('psearch.atShop', { shop: shop.name || '' })}{place ? ` · ${place}` : ''}
              </Text>
              {!open || shop.distance_km != null ? (
                <View style={styles.meta}>
                  {!open ? <Badge tone="warn">{t('open.closedPill')}</Badge> : null}
                  {shop.distance_km != null ? <Badge>{t('shops.kmAway', { km: shop.distance_km })}</Badge> : null}
                </View>
              ) : null}
              {!open ? (
                <Text style={styles.closedHint} numberOfLines={2}>
                  {availabilityLine(t, shop.availability, lang)}
                </Text>
              ) : null}
            </View>
            <Text style={styles.chev}>›</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: sizes.pad },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    minHeight: sizes.tap,
    marginBottom: 10,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 8 },
  // 44px minimum: this clears a typed query, which is money-adjacent enough
  // (it is how a shopper gets back to browsing) to deserve a real target.
  clearBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  clearText: { color: colors.textMuted, fontSize: 18 },

  // The voice control. Full width, accent-filled and 64pt tall: it has to read
  // as the primary action on the screen from across a dim room, to someone who
  // is not going to read the label.
  voiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: sizes.radius,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 64,
    marginBottom: sizes.gap,
  },
  voiceBtnActive: { backgroundColor: colors.accentDark },
  voiceIcon: { fontSize: 28, marginRight: 12 },
  voiceTextWrap: { flex: 1 },
  voiceTitle: { color: colors.onAccent, fontSize: 18, fontWeight: '800' },
  voiceSub: { color: colors.onAccent, fontSize: 14, marginTop: 2, opacity: 0.85 },
  voiceHint: { color: colors.textMuted, fontSize: 13, marginBottom: sizes.gap },

  stateCard: {
    backgroundColor: colors.card,
    borderRadius: sizes.radius,
    padding: 28,
    alignItems: 'center',
    marginBottom: sizes.gap,
  },
  stateIcon: { fontSize: 40, marginBottom: 10 },
  stateText: { color: colors.textMuted, fontSize: 16, textAlign: 'center' },

  shelfHeading: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: sizes.gap,
  },

  // Each section is a titled block. A section with nothing in it is not
  // rendered at all, so these never appear empty.
  section: { marginBottom: 22 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: 10 },
  clearRecent: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8, marginBottom: 10 },
  clearRecentText: { color: colors.accent, fontSize: 15, fontWeight: '700' },

  // Buy it again: full-width rows, not chips. The item name is the tap target
  // and it must not be truncated into something a shopper cannot recognize.
  againRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: sizes.radius,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: sizes.tap,
    marginBottom: 8,
  },
  againIcon: { color: colors.accent, fontSize: 20, marginRight: 12 },
  againText: { flex: 1 },
  againName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  againShop: { color: colors.textMuted, fontSize: 13, marginTop: 2 },

  recentWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  recentChip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardAlt,
    maxWidth: '100%',
  },
  recentText: { color: colors.text, fontSize: 15 },

  // Category chips. Each is a full 44pt-tall target because this is how a
  // shopper who cannot spell "shampoo" gets anywhere at all.
  cats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cat: {
    minHeight: sizes.tap,
    minWidth: 104,
    flexGrow: 1,
    flexBasis: '46%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: sizes.radius,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  catIcon: { fontSize: 20 },
  catLabel: { color: colors.text, fontSize: 14, fontWeight: '600', flexShrink: 1 },

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

  card: {
    backgroundColor: colors.card,
    borderRadius: sizes.radius,
    padding: sizes.pad,
    marginBottom: sizes.gap,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pressed: { opacity: 0.85 },
  thumb: { marginRight: 12 },
  info: { flex: 1 },
  name: { color: colors.text, fontSize: 17, fontWeight: '700' },
  price: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 4 },
  per: { color: colors.textMuted, fontSize: 13, fontWeight: '400' },
  at: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  meta: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  closedHint: { color: colors.textMuted, fontSize: 13, marginTop: 6 },
  chev: { color: colors.textMuted, fontSize: 28, marginLeft: 8 },
});
