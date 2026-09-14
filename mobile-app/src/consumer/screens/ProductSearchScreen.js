import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, StyleSheet,
} from 'react-native';
import { colors, sizes } from '../theme';
import { Button, Badge } from '../components';
import ProductThumb from '../components/ProductThumb';
import { money } from '../money';
import { publicApi } from '../consumerApi';
import { friendlyError, canRetry, isCancelled } from '../lib/errorText';
import { useT } from '../i18n';
import { availabilityLine, isOpen } from '../../lib/shopOpen';

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

const DEBOUNCE_MS = 350;

export default function ProductSearchScreen({ route, navigation }) {
  const { t, lang } = useT();
  const initialQ = (route.params && route.params.q) || '';

  const [q, setQ] = useState(initialQ);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retryable, setRetryable] = useState(false);
  const [searched, setSearched] = useState(false);

  // Monotonic id of the newest request, plus the AbortController of whatever is
  // currently in flight.
  const reqIdRef = useRef(0);
  const abortRef = useRef(null);
  const debounceRef = useRef(null);
  // The term the last request was for, so Retry re-runs the right search.
  const lastTermRef = useRef(initialQ);

  const runSearch = useCallback(async (term) => {
    const text = String(term || '').trim();
    lastTermRef.current = text;

    // Whatever was in flight is now superseded — stop paying for it.
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch (e) { /* already settled */ }
      abortRef.current = null;
    }

    if (!text) {
      reqIdRef.current += 1; // invalidate anything still landing
      setProducts([]);
      setSearched(false);
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

    try {
      const r = await publicApi.searchProducts({
        q: text, lang, limit: 30, signal: controller ? controller.signal : undefined,
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

  // Seed from a category chip / the directory's product bar and search at once.
  useEffect(() => {
    if (initialQ) runSearch(initialQ);
    // Only for the term the screen was opened with; typing is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tear down on unmount: kill the pending timer AND the in-flight request, so
  // leaving the screen mid-search costs nothing more.
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) { try { abortRef.current.abort(); } catch (e) { /* ignore */ } }
    reqIdRef.current += 1;
  }, []);

  function onType(value) {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(value), DEBOUNCE_MS);
  }

  function submitNow() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    runSearch(q);
  }

  function clearAll() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQ('');
    runSearch('');
  }

  function openShop(shop) {
    navigation.navigate('ShopDetail', { shopId: shop.id, shopName: shop.name });
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
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
        {q ? (
          <Pressable onPress={clearAll} style={styles.clearBtn} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <Text style={styles.clearText}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {/* ---- the four states, each visibly its own thing ---- */}

      {/* FAILED: a red-bordered card that names the problem and offers the one
          action that helps. Nothing about it resembles the empty state. */}
      {error ? (
        <View style={styles.errCard}>
          <Text style={styles.errIcon}>⚠️</Text>
          <Text style={styles.errTitle}>{t('psearch.failedTitle')}</Text>
          <Text style={styles.errText}>{error}</Text>
          {retryable ? (
            <Button title={t('common.retry')} onPress={() => runSearch(lastTermRef.current)} style={styles.errBtn} />
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

      {/* NOT SEARCHED YET */}
      {!error && !loading && !searched ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateIcon}>🔍</Text>
          <Text style={styles.stateText}>{t('psearch.start')}</Text>
        </View>
      ) : null}

      {/* SEARCHED, GENUINELY NOTHING */}
      {!error && !loading && searched && products.length === 0 ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateIcon}>🫙</Text>
          <Text style={styles.stateText}>{t('psearch.none', { q: String(q).trim() })}</Text>
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
    marginBottom: sizes.gap,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 8 },
  // 44px minimum: this clears a typed query, which is money-adjacent enough
  // (it is how a shopper gets back to browsing) to deserve a real target.
  clearBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  clearText: { color: colors.textMuted, fontSize: 18 },

  stateCard: {
    backgroundColor: colors.card,
    borderRadius: sizes.radius,
    padding: 28,
    alignItems: 'center',
    marginBottom: sizes.gap,
  },
  stateIcon: { fontSize: 40, marginBottom: 10 },
  stateText: { color: colors.textMuted, fontSize: 16, textAlign: 'center' },

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
