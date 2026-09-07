import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, sizes } from '../theme';
import { Card, Button, Field, ErrorBanner, Loading } from '../components';
import { money, toPaise } from '../money';
import { my } from '../consumerApi';
import { useT } from '../i18n';

// Priority 2 — one shop's ledger from GET /my/khata/:shopId, with a Pay action.
// transactions: [{ id, type, amount(paise), method, note, created_at }].
// A `purchase` increases what is owed (red); anything else is money in (green).
export default function ShopKhataScreen({ route, navigation }) {
  const { t } = useT();
  const { shopId, shopName } = route.params;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [amount, setAmount] = useState('');
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await my.shopKhata(shopId);
      setData(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [shopId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const balance = data ? Number(data.balance) : 0;
  const owes = balance > 0;

  async function pay() {
    setPayError('');
    const paise = toPaise(amount);
    if (paise <= 0) { setPayError(t('shopkhata.enterAmount')); return; }
    if (!owes) { setPayError(t('shopkhata.nothingDue')); return; }
    if (paise > balance) { setPayError(t('shopkhata.overpay')); return; }
    setPaying(true);
    try {
      // POST /my/pay -> { link, order_id }. The backend ALWAYS returns a hosted
      // Razorpay Payment Link, so open it in the in-app PayWebView; a return to
      // the callback URL is treated as done and the khata is refreshed.
      const r = await my.pay(shopId, paise);
      const link = r.link || r.pay_link;
      if (!link) throw new Error(t('login.failed'));
      setAmount('');
      navigation.navigate('PayWebView', { url: link, shopName });
    } catch (err) {
      setPayError(err.message);
    } finally {
      setPaying(false);
    }
  }

  function txnLabel(type) {
    if (type === 'purchase') return t('txn.purchase');
    if (type === 'payment') return t('txn.payment');
    if (type === 'cash') return t('txn.cash');
    if (type === 'credit') return t('txn.credit');
    return type;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
    >
      <ErrorBanner>{error}</ErrorBanner>

      {loading && !data ? (
        <Loading text={t('shopkhata.loading')} />
      ) : (
        <>
          <Card style={styles.balCard}>
            <Text style={styles.balShop}>{data ? data.shop_name : shopName}</Text>
            <Text style={styles.balLabel}>{owes ? t('khata.owe') : balance < 0 ? t('khata.advance') : t('khata.settled')}</Text>
            <Text style={[styles.balValue, { color: owes ? colors.danger : colors.accent }]}>
              {money(Math.abs(balance))}
            </Text>
          </Card>

          {owes ? (
            <Card>
              <Text style={styles.payTitle}>{t('shopkhata.payTitle', { shop: data ? data.shop_name : shopName })}</Text>
              <Text style={styles.owe}>{t('shopkhata.youOwe', { amt: money(balance) })}</Text>
              <Field
                label={t('shopkhata.amountRupees')}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                keyboardType="decimal-pad"
              />
              <Button
                title={t('shopkhata.payFull')}
                variant="secondary"
                onPress={() => setAmount((balance / 100).toFixed(2))}
                style={styles.fullBtn}
              />
              <ErrorBanner>{payError}</ErrorBanner>
              <Button
                title={paying ? t('shopkhata.starting') : t('shopkhata.startPay')}
                onPress={pay}
                loading={paying}
              />
            </Card>
          ) : null}

          <Card>
            <Text style={styles.entriesTitle}>{t('shopkhata.entries')}</Text>
            {data && data.transactions && data.transactions.length > 0 ? (
              data.transactions.map((tx) => {
                const isPurchase = tx.type === 'purchase';
                return (
                  <View key={tx.id} style={styles.txn}>
                    <View style={styles.txnLeft}>
                      <Text style={styles.txnType}>{txnLabel(tx.type)}</Text>
                      {tx.note ? <Text style={styles.txnNote} numberOfLines={1}>{tx.note}</Text> : null}
                      <Text style={styles.txnDate}>{new Date(tx.created_at).toLocaleDateString()}</Text>
                    </View>
                    <Text style={[styles.txnAmt, { color: isPurchase ? colors.danger : colors.accent }]}>
                      {isPurchase ? '+' : '−'}{money(tx.amount)}
                    </Text>
                  </View>
                );
              })
            ) : (
              <Text style={styles.noEntries}>{t('shopkhata.noEntries')}</Text>
            )}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: sizes.pad },
  balCard: { alignItems: 'center', paddingVertical: 20 },
  balShop: { color: colors.text, fontSize: 20, fontWeight: '800' },
  balLabel: { color: colors.textMuted, fontSize: 14, marginTop: 8 },
  balValue: { fontSize: sizes.big, fontWeight: '800', marginTop: 4 },
  payTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 4 },
  owe: { color: colors.textMuted, fontSize: 14, marginBottom: 12 },
  fullBtn: { marginBottom: sizes.gap },
  entriesTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 10 },
  txn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  txnLeft: { flex: 1, paddingRight: 12 },
  txnType: { color: colors.text, fontSize: 16, fontWeight: '600' },
  txnNote: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  txnDate: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  txnAmt: { fontSize: 17, fontWeight: '800' },
  noEntries: { color: colors.textMuted, fontSize: 15 },
});
