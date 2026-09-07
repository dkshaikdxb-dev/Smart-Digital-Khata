import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, sizes } from '../theme';
import { Card, ErrorBanner, Loading, Empty } from '../components';
import { money } from '../money';
import { my } from '../consumerApi';
import { useT } from '../i18n';

// Priority 2 (core value) — cross-shop khata from GET /my/khata.
// balance is INTEGER PAISE: > 0 means the customer OWES, < 0 means advance.
export default function KhataScreen({ navigation }) {
  const { t } = useT();
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
            <Text style={styles.totalLabel}>{t('khata.totalOutstanding')}</Text>
            <Text style={[styles.totalValue, { color: total > 0 ? colors.danger : colors.accent }]}>
              {money(total)}
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
