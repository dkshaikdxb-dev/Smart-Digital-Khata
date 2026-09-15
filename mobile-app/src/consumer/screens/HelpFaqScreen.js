import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { colors, sizes } from '../theme';
import { Card } from '../components';
import { useT } from '../i18n';

// Help & FAQ — a static, collapsible list of the questions a shopper actually
// asks. NOT a bot, no network, works with the phone in flight mode, and every
// answer is already translated into Hindi, Tamil, Telugu, Kannada, Malayalam and
// Urdu because it was copied whole from the web app's own chelp.* entries.
//
// WHICH ENTRIES, AND WHY NOT ALL NINE. The web has nine. Six are here. The three
// that were left out describe controls this app does not have, and an answer
// that sends someone hunting for a button that is not there is worse than no
// answer at all:
//
//   e1 "How do I find a shop?" tells the reader to tap "Use my location". The
//      native shop directory deliberately has no GPS (see ShopsScreen) — search
//      by name or city is the whole discovery UX here.
//   e8 points at "the language switch at the top"; on this app the language
//      picker lives on the Account screen.
//   e9 explains the light/dark toggle. The native app has one theme.
//
// Rewriting those three to match the native app would mean authoring six new
// sentences and then ten translations of each, which is not this batch's work.
// They are listed in the handover instead.
const ENTRIES = [
  { key: 'e2', icon: '🧺' },
  { key: 'e3', icon: '🛒' },
  { key: 'e4', icon: '🛵' },
  { key: 'e5', icon: '💳' },
  { key: 'e6', icon: '📒' },
  { key: 'e7', icon: '📦' },
];

export default function HelpFaqScreen() {
  const { t } = useT();
  // Which question is expanded. One at a time keeps the list scannable on a
  // small screen; tapping the open one closes it.
  const [open, setOpen] = useState(null);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card>
        <Text style={styles.title}>{t('chelp.title')}</Text>
        <Text style={styles.subtitle}>{t('chelp.subtitle')}</Text>
      </Card>

      {ENTRIES.map((e) => {
        const expanded = open === e.key;
        return (
          <Card key={e.key}>
            <Pressable
              onPress={() => setOpen(expanded ? null : e.key)}
              style={styles.qRow}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
            >
              <Text style={styles.icon} accessibilityElementsHidden importantForAccessibility="no">
                {e.icon}
              </Text>
              <Text style={styles.q}>{t(`chelp.${e.key}.q`)}</Text>
              <Text style={styles.chev}>{expanded ? '▲' : '▼'}</Text>
            </Pressable>
            {expanded ? <Text style={styles.a}>{t(`chelp.${e.key}.a`)}</Text> : null}
          </Card>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: sizes.pad },
  title: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  subtitle: { color: colors.textMuted, fontSize: 13 },
  // A whole row is the tap target, not just the text: 52px against the app's own
  // token, because this list is read by the people with the least steady hands.
  qRow: { flexDirection: 'row', alignItems: 'center', minHeight: sizes.tap },
  icon: { fontSize: 22, marginRight: 12 },
  q: { color: colors.text, fontSize: 16, fontWeight: '700', flex: 1, paddingRight: 10 },
  chev: { color: colors.textMuted, fontSize: 14 },
  a: { color: colors.textMuted, fontSize: 15, lineHeight: 22, marginTop: 8 },
});
