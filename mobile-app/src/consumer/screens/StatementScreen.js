import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import Constants from 'expo-constants';
import { colors, sizes } from '../theme';
import { Card, Field, Button, ErrorBanner, Loading } from '../components';
import { money } from '../money';
import { my } from '../consumerApi';
import { friendlyError } from '../lib/errorText';
import { isoDay, daysAgo, rangeProblem } from '../lib/dateRange';
import { useT } from '../i18n';

const CONSUMER_URL =
  Constants.expoConfig?.extra?.consumerUrl || 'https://khata.dadashaik.com/c';

// Account statement: opening balance, the dated ledger lines in a range, closing
// balance and totals — for one shop or for every shop the shopper has a khata at.
//
// WHAT IS HERE AND WHAT IS NOT. The web offers View, Download CSV and Print. Only
// View is built here, and that is a judgement, not an omission:
//
//   * Download CSV needs a file to land somewhere and an app to open it. Writing
//     a file needs expo-file-system and handing it on needs expo-sharing; neither
//     is a dependency, and adding one costs an EAS rebuild that this batch must
//     not require. Even with them, a CSV on a ₹6,000 Android with no spreadsheet
//     app installed is a file the shopper cannot open.
//   * Print needs expo-print, same rebuild, plus a printer, which is not the
//     device this audience owns.
//
// So both keep their honest home on the web, reached through the token-bridged
// FeatureWebView the Account screen already uses for prepay — one tap, already
// signed in. What a shopper standing at a counter actually needs is to SEE the
// entries and the closing balance, and that is what this screen does.
//
// MONEY. Every figure arrives as integer paise and is formatted by money();
// nothing here adds, averages or converts. The combined figure across shops is
// the server's own integer sum, not one computed in the app.
export default function StatementScreen({ navigation }) {
  const { t } = useT();
  const [shops, setShops] = useState([]);
  const [pick, setPick] = useState(''); // '' = all shops combined
  const [from, setFrom] = useState(daysAgo(90));
  const [to, setTo] = useState(isoDay());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  // The shop picker is built from the shopper's own khata list, so it can only
  // ever offer shops they actually have a ledger at. A failure here is not fatal
  // — "all shops" still works — so it never raises the page-level error.
  useEffect(() => {
    let alive = true;
    my.khata()
      .then((r) => { if (alive) setShops(r.shops || []); })
      .catch(() => { /* the all-shops statement does not need this list */ });
    return () => { alive = false; };
  }, []);

  const view = useCallback(async () => {
    setNote('');
    setError('');
    const problem = rangeProblem(from, to);
    if (problem === 'format') { setNote(t('stmt.badDate')); return; }
    if (problem === 'order') { setNote(t('stmt.rangeError')); return; }
    setLoading(true);
    try {
      const r = await my.statement({ shopId: pick || undefined, from, to });
      setData(r);
    } catch (err) {
      setData(null);
      setError(friendlyError(t, err) || t('stmt.loadError'));
    } finally {
      setLoading(false);
    }
  }, [from, to, pick, t]);

  function preset(days) {
    setFrom(daysAgo(days));
    setTo(isoDay());
    setData(null);
  }

  // One shop -> { shop: {...} }; all shops -> { shops: [...], combined }.
  const blocks = data
    ? (data.shop ? [data.shop] : (data.shops || []))
    : [];

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ErrorBanner>{error}</ErrorBanner>

        <Card>
          <Text style={styles.title}>{t('stmt.title')}</Text>
          <Text style={styles.subtitle}>{t('stmt.subtitle')}</Text>

          <Text style={styles.label}>{t('stmt.pickShop')}</Text>
          <View style={styles.chips}>
            <Chip label={t('stmt.allShops')} active={pick === ''} onPress={() => { setPick(''); setData(null); }} />
            {shops.map((s) => (
              <Chip
                key={s.shop_id}
                label={s.shop_name}
                active={pick === s.shop_id}
                onPress={() => { setPick(s.shop_id); setData(null); }}
              />
            ))}
          </View>

          <View style={styles.chips}>
            <Chip label={t('stmt.last30')} active={false} onPress={() => preset(30)} />
            <Chip label={t('stmt.last90')} active={false} onPress={() => preset(90)} />
          </View>

          <View style={styles.dates}>
            <View style={styles.dateCol}>
              <Field
                label={t('stmt.from')}
                value={from}
                onChangeText={setFrom}
                placeholder="YYYY-MM-DD"
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={styles.dateCol}>
              <Field
                label={t('stmt.to')}
                value={to}
                onChangeText={setTo}
                placeholder="YYYY-MM-DD"
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>

          <Button title={t('stmt.view')} onPress={view} loading={loading} />
          {note ? <Text style={styles.note}>{note}</Text> : null}
        </Card>

        {loading ? <Loading text={t('common.loading')} /> : null}

        {!loading && data && blocks.length === 0 ? (
          <Card><Text style={styles.muted}>{t('stmt.noData')}</Text></Card>
        ) : null}

        {!loading && blocks.map((b) => (
          <StatementBlock key={b.shop_id || b.shop_name} block={b} t={t} />
        ))}

        {!loading && data && data.combined && blocks.length > 1 ? (
          <Card>
            <Text style={styles.blockTitle}>{t('stmt.combined')}</Text>
            <Totals stmt={data.combined} t={t} />
          </Card>
        ) : null}

        {/* The two things a phone honestly cannot do, handed to the surface that
            can, already signed in. */}
        <Card>
          <Text style={styles.title}>{t('stmt.exportOnWeb')}</Text>
          <Text style={styles.subtitle}>{t('stmt.exportOnWebSub')}</Text>
          <Button
            title={t('stmt.exportOnWeb')}
            variant="secondary"
            onPress={() => navigation.navigate('FeatureWebView', {
              base: CONSUMER_URL,
              path: '/account',
              title: t('stmt.title'),
            })}
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Chip({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function Totals({ stmt, t }) {
  return (
    <View>
      <Line label={t('stmt.opening')} value={money(stmt.opening)} />
      <Line label={t('stmt.totalPurchases')} value={money(stmt.total_purchases)} />
      <Line label={t('stmt.totalPaid')} value={money(stmt.total_paid)} />
      {/* Shown only when the shop actually adjusted something. An adjustment is
          NOT money the shopper handed over and never joins "total paid". */}
      {Number(stmt.total_adjusted) > 0 ? (
        <Line label={t('stmt.totalAdjusted')} value={money(stmt.total_adjusted)} />
      ) : null}
      <Line label={t('stmt.closing')} value={money(stmt.closing)} strong />
    </View>
  );
}

function Line({ label, value, strong }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={[styles.lineValue, strong && styles.lineValueStrong]}>{value}</Text>
    </View>
  );
}

// One shop's statement. Rendered as stacked rows, not a table: a five-column
// table on a 320dp screen is either unreadable or sideways-scrolling, and the
// shopper is reading down a list of "what happened and what I owed after it".
function StatementBlock({ block, t }) {
  const stmt = block.statement || {};
  const lines = stmt.lines || [];
  const txnLabel = (type) => {
    const s = t(`txn.${type}`);
    return s === `txn.${type}` ? type : s;
  };
  return (
    <Card>
      <Text style={styles.blockTitle}>{block.shop_name}</Text>
      <Totals stmt={stmt} t={t} />
      {lines.length === 0 ? (
        <Text style={styles.muted}>{t('stmt.noData')}</Text>
      ) : (
        lines.map((l) => {
          // A purchase raises what is owed; a payment and a shop adjustment both
          // lower it, so both read as a minus — the same rule the web uses.
          const up = l.type === 'purchase';
          return (
            <View key={l.id} style={styles.entry}>
              <View style={styles.entryTop}>
                <Text style={styles.entryType}>{txnLabel(l.type)}</Text>
                <Text style={[styles.entryAmt, { color: up ? colors.danger : colors.positive }]}>
                  {up ? '+' : '−'}{money(l.amount)}
                </Text>
              </View>
              <View style={styles.entryTop}>
                <Text style={styles.entryDate}>
                  {l.created_at ? new Date(l.created_at).toLocaleDateString() : ''}
                </Text>
                <Text style={styles.entryBal}>{t('common.balance')}: {money(l.balance)}</Text>
              </View>
              {l.note ? <Text style={styles.entryNote}>{l.note}</Text> : null}
            </View>
          );
        })
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: sizes.pad },
  title: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  subtitle: { color: colors.textMuted, fontSize: 13, marginBottom: 12 },
  label: { color: colors.textMuted, fontSize: 14, marginBottom: 6, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 999,
    paddingHorizontal: 16, minHeight: 44, maxWidth: 260,
    alignItems: 'center', justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  chipTextActive: { color: colors.onAccent },
  dates: { flexDirection: 'row', gap: 10 },
  dateCol: { flex: 1 },
  note: { color: colors.warn, fontSize: 14, marginTop: 10 },
  muted: { color: colors.textMuted, fontSize: 15 },
  blockTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: 10 },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  lineLabel: { color: colors.textMuted, fontSize: 14, flex: 1, paddingRight: 10 },
  lineValue: { color: colors.text, fontSize: 15, fontWeight: '600' },
  lineValueStrong: { fontSize: 17, fontWeight: '800' },
  entry: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 10 },
  entryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  entryType: { color: colors.text, fontSize: 15, fontWeight: '700', flex: 1, paddingRight: 10 },
  entryAmt: { fontSize: 16, fontWeight: '800' },
  entryDate: { color: colors.textMuted, fontSize: 13 },
  entryBal: { color: colors.textMuted, fontSize: 13 },
  entryNote: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
});
