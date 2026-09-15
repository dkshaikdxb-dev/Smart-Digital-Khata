import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, sizes } from '../theme';
import { Card, Button } from '../components';
import { useT } from '../i18n';
import { getUpdateStatus, checkAndApplyUpdate, updateAge } from '../../lib/appUpdates';

// "App version & updates" — the one place in the consumer app that says WHICH
// bundle is running. See src/lib/appUpdates.js for why this is necessary: with
// fallbackToCacheTimeout at 0 a new update only shows on the NEXT launch, and on
// Android a "reopen" that resumes the process applies nothing at all — so an app
// that is updating perfectly and an app that is not updating at all look
// identical from the outside. This card is the difference.
//
// Two things on screen, deliberately in this order:
//   1. Whether this is the bundle built into the APK (never updated) or a
//      downloaded update, with a short id and an age.
//   2. One button that checks, downloads and restarts — collapsing the two-launch
//      wait into a single tap.
//
// The card renders on any build. Where expo-updates is missing or switched off
// (Expo Go, dev client) it says so plainly and the button is not shown, because a
// button that can only fail is worse than no button.

export default function UpdateStatusCard() {
  const { t } = useT();
  // Read once per mount: these values cannot change without the app restarting,
  // and re-reading them on every render would hide that fact.
  const status = useMemo(() => getUpdateStatus(), []);
  const age = useMemo(() => updateAge(status.createdAt), [status.createdAt]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [noteTone, setNoteTone] = useState('muted');

  function ageLine() {
    if (!age) return '';
    if (age.unit === 'now') return t('upd.ageNow');
    if (age.unit === 'minutes') return t('upd.ageMinutes', { n: age.n });
    if (age.unit === 'hours') return t('upd.ageHours', { n: age.n });
    return t('upd.ageDays', { n: age.n });
  }

  async function check() {
    setBusy(true);
    setNote('');
    const r = await checkAndApplyUpdate({
      // Said BEFORE the reload tears this screen down; see appUpdates.js.
      onReloading: () => { setNoteTone('ok'); setNote(t('upd.reloading')); },
    });
    if (r.outcome === 'uptodate') { setNoteTone('muted'); setNote(t('upd.upToDate')); }
    else if (r.outcome === 'disabled') { setNoteTone('muted'); setNote(t('upd.disabled')); }
    else if (r.outcome === 'failed') { setNoteTone('bad'); setNote(t('upd.failed')); }
    else { setNoteTone('ok'); setNote(t('upd.reloading')); }
    setBusy(false);
  }

  const unknown = t('upd.unknown');
  const canCheck = status.available && status.enabled;

  return (
    <Card>
      <Text style={styles.title}>{t('upd.title')}</Text>
      <Text style={styles.subtitle}>{t('upd.sub')}</Text>

      {/* The headline fact. An embedded launch is not a bug on its own — a
          fresh install always starts there — but if it is still embedded days
          after an update was published, that IS the bug, and this is the only
          place it is visible. */}
      <View style={[styles.pill, status.embedded ? styles.pillWarn : styles.pillOk]}>
        <Text style={styles.pillText}>
          {status.embedded ? `📦 ${t('upd.embedded')}` : `⬇️ ${t('upd.downloaded')}`}
        </Text>
      </View>

      <Row label={t('upd.bundle')} value={status.shortId || unknown} mono />
      {age ? <Row label={t('upd.builtOn')} value={ageLine()} /> : null}
      <Row label={t('upd.runtime')} value={status.runtimeVersion || unknown} mono />
      <Row label={t('upd.channel')} value={status.channel || unknown} mono />

      {canCheck ? (
        <Button
          title={busy ? t('upd.checking') : t('upd.check')}
          onPress={check}
          loading={busy}
          variant="secondary"
          style={styles.btn}
        />
      ) : (
        <Text style={styles.disabled}>{t('upd.disabled')}</Text>
      )}

      {note ? (
        <Text
          style={[
            styles.note,
            noteTone === 'ok' && styles.noteOk,
            noteTone === 'bad' && styles.noteBad,
          ]}
        >
          {note}
        </Text>
      ) : null}
    </Card>
  );
}

function Row({ label, value, mono }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.mono]} numberOfLines={1} selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  subtitle: { color: colors.textMuted, fontSize: 13, marginBottom: 12 },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
  },
  pillOk: { backgroundColor: 'rgba(34,197,94,0.2)' },
  pillWarn: { backgroundColor: 'rgba(245,158,11,0.2)' },
  pillText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  rowLabel: { color: colors.textMuted, fontSize: 14, width: 110 },
  rowValue: { color: colors.text, fontSize: 14, fontWeight: '600', flex: 1 },
  mono: { fontVariant: ['tabular-nums'], letterSpacing: 1 },
  btn: { marginTop: 14 },
  disabled: { color: colors.textMuted, fontSize: 13, marginTop: 12 },
  note: { color: colors.textMuted, fontSize: 14, marginTop: 10 },
  noteOk: { color: colors.accent },
  noteBad: { color: '#fecaca' },
});
