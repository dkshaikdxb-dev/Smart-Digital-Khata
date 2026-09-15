import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Share,
} from 'react-native';
import { colors, sizes } from '../theme';
import { Card, Button, ErrorBanner, Loading } from '../components';
import { money } from '../money';
import { consumerAuth } from '../consumerApi';
import { friendlyError } from '../lib/errorText';
import { useT } from '../i18n';

// "Invite & earn" — the shopper's own referral code, a share link, the credit it
// has earned and who has joined through it. GET /api/customer-auth/referral is
// the same endpoint the web card uses, so both surfaces show one set of numbers.
//
// WHY THIS ONE MADE THE CUT. Word of mouth is how a kirana app actually spreads
// in a small town, and the native app is the surface the audience has open. The
// web had a Copy-link button; a phone has something better, and it costs no
// dependency: React Native's own Share sheet, which puts the link straight into
// WhatsApp, where these invitations actually travel.
//
// The shared message is the LINK ALONE, deliberately. Wrapping it in an English
// sentence would send English prose from a shopper who chose Bengali to a friend
// who also does not read English — and writing that sentence in ten languages is
// exactly the translation work this batch is not allowed to invent. A bare link
// is understood everywhere, and the person sharing adds their own words.
//
// MONEY. `reward.accrued_paise` is integer paise (a bigint on the wire, so it can
// arrive as a string); money() formats it and nothing here does arithmetic on it.
export default function ReferralScreen() {
  const { t } = useT();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    consumerAuth.referral()
      .then((r) => { if (alive) setData(r); })
      .catch((err) => { if (alive) setError(friendlyError(t, err) || t('ref.loadError')); });
    return () => { alive = false; };
  }, [t]);

  const link = data ? (data.link || data.link_path || '') : '';

  async function share() {
    if (!link) return;
    try {
      await Share.share({ message: link });
    } catch (e) {
      // The user dismissing the sheet also lands here on some devices; there is
      // nothing to report either way.
    }
  }

  if (error) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <ErrorBanner>{error}</ErrorBanner>
      </ScrollView>
    );
  }
  if (!data) {
    return (
      <View style={styles.container}>
        <Loading text={t('common.loading')} />
      </View>
    );
  }

  const counts = data.counts || {};
  const referredTotal = Number(counts.referred_total) || 0;
  const activatedTotal = Number(counts.activated_total) || 0;
  const accrued = (data.reward && data.reward.accrued_paise) || 0;
  const referred = data.referred || [];

  const typeLabel = (v) => {
    const s = t(`ref.type.${v}`);
    return s === `ref.type.${v}` ? v : s;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card>
        <Text style={styles.title}>{t('ref.title')}</Text>
        <Text style={styles.subtitle}>{t('ref.subtitle')}</Text>

        <Text style={styles.label}>{t('ref.yourCode')}</Text>
        {/* Selectable so it can be read out or copied by long-press — the code
            is often passed on by voice, not by link. */}
        <Text style={styles.code} selectable>{data.code}</Text>

        {link ? (
          <>
            <Text style={styles.link} selectable numberOfLines={2}>{link}</Text>
            <Button title={`🔗 ${t('ref.shareLink')}`} onPress={share} />
          </>
        ) : null}
      </Card>

      <Card>
        <Text style={styles.label}>{t('ref.creditBalance')}</Text>
        <Text style={styles.credit}>{money(accrued)}</Text>
        <Text style={styles.counts}>
          {t('ref.referredCount', { n: referredTotal })}
          {'  ·  '}
          {t('ref.activatedOf', { a: activatedTotal, n: referredTotal })}
        </Text>
      </Card>

      <Card>
        {referred.length === 0 ? (
          <Text style={styles.muted}>{t('ref.noneYet')}</Text>
        ) : (
          referred.slice(0, 20).map((r) => (
            <View key={r.id} style={styles.row}>
              <Text style={styles.rowText} numberOfLines={1}>
                {r.label || typeLabel(r.referred_type)}
              </Text>
              {r.source_channel ? <Text style={styles.rowSub}>{r.source_channel}</Text> : null}
            </View>
          ))
        )}
        {data.referred_by ? (
          <Text style={styles.invitedBy}>
            {t('ref.referredByLabel')}{' '}
            <Text style={styles.invitedByName}>
              {data.referred_by.label || data.referred_by.code}
            </Text>
          </Text>
        ) : null}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: sizes.pad },
  title: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  subtitle: { color: colors.textMuted, fontSize: 13, marginBottom: 14 },
  label: { color: colors.textMuted, fontSize: 14, fontWeight: '600', marginBottom: 6 },
  code: { color: colors.accent, fontSize: 28, fontWeight: '800', letterSpacing: 3, marginBottom: 12 },
  link: { color: colors.text, fontSize: 14, marginBottom: 12 },
  credit: { color: colors.accent, fontSize: sizes.big, fontWeight: '800', marginBottom: 6 },
  counts: { color: colors.textMuted, fontSize: 14 },
  muted: { color: colors.textMuted, fontSize: 15 },
  row: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  rowSub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  invitedBy: { color: colors.textMuted, fontSize: 14, marginTop: 14 },
  invitedByName: { color: colors.text, fontWeight: '700' },
});
