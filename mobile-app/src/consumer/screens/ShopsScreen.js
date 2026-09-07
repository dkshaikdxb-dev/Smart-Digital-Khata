import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, RefreshControl,
} from 'react-native';
import { colors, sizes } from '../theme';
import { Card, Field, Button, ErrorBanner, Loading, Empty, Badge } from '../components';
import { money } from '../money';
import { publicApi } from '../consumerApi';
import { useT } from '../i18n';

// Priority 3 — public shop directory from GET /public/shops. Search by name/city
// (server matches either). GPS is intentionally NOT used here: no location
// permission and no extra dependency; the search box is the whole discovery UX,
// which degrades gracefully everywhere.
export default function ShopsScreen({ navigation }) {
  const { t } = useT();
  const [search, setSearch] = useState('');
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (term) => {
    setError('');
    try {
      const r = await publicApi.shops({ search: term, limit: 50 });
      setShops(r.shops || r.items || []);
    } catch (err) {
      setError(err.message);
      setShops([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(''); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(search); };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
    >
      <Card>
        <Field
          value={search}
          onChangeText={setSearch}
          placeholder={t('shops.searchPlaceholder')}
          returnKeyType="search"
          onSubmitEditing={() => load(search)}
        />
        <Button title={t('common.search')} onPress={() => load(search)} />
      </Card>

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
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.info}>
              <Text style={styles.name}>{s.name}</Text>
              <Text style={styles.loc}>
                {[s.area, s.city].filter(Boolean).join(', ') || t('shops.noLocation')}
              </Text>
              <View style={styles.meta}>
                <Badge>{t('shops.itemsCount', { n: Number(s.product_count || 0) })}</Badge>
                {s.distance_km != null ? <Badge>{t('shops.kmAway', { km: s.distance_km })}</Badge> : null}
                {s.offers_delivery ? <Badge tone="ok">🛵</Badge> : null}
              </View>
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
  row: {
    backgroundColor: colors.card,
    borderRadius: sizes.radius,
    padding: sizes.pad,
    marginBottom: sizes.gap,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pressed: { opacity: 0.85 },
  info: { flex: 1 },
  name: { color: colors.text, fontSize: 18, fontWeight: '700' },
  loc: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  meta: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  chev: { color: colors.textMuted, fontSize: 28, marginLeft: 8 },
});
