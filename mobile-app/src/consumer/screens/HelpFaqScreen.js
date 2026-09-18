import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { colors, sizes } from '../theme';
import { Card } from '../components';
import { useT } from '../i18n';
import { useNativeVoice } from '../../lib/useNativeVoice';

// Help & FAQ — a static, collapsible list of the questions a shopper actually
// asks. NOT a bot, no network, works with the phone in flight mode, and every
// answer is already translated into all ten languages because it was copied
// whole from the web app's own chelp.* entries.
//
// SIX ENTRIES, NOT THE WEB'S NINE — and the reason is content, not layout.
//
// e1, e8 and e9 exist in the WEB dictionary only. They are absent from this
// app's dictionary in every language, English included, so rendering them makes
// translate() fall through to its last resort and print the key name: a shopper
// opening Help would read the literal text "chelp.e1.q". They were shown briefly
// and taken back out for exactly that reason.
//
// Adding them is not a matter of copying the web answers across either, because
// all three describe controls this app does not have:
//
//   e1 "Tap 'Use my location' to see shops near you" — the native shop directory
//      has no GPS at all, by decision (see ShopsScreen). Searching by shop name
//      or city, by keyboard or by microphone, is the whole discovery UX here.
//   e8 "Tap the language switch at the top" — on this app the language picker is
//      on the Profile screen. The voice half of that answer is true on both
//      surfaces, including the read-aloud control below.
//   e9 "Tap the sun/moon button" — this app has one dark theme and no toggle, so
//      even the QUESTION presupposes a control that is not there.
//
// So they need app-specific English first and then ten translations each: four
// strings (e1.a, e8.a, e9.q, e9.a) across ten languages, forty in all. That is a
// translation task with its own review, and the mechanism for it already exists
// — the app dictionary may hold a different value for a chelp.* key than the web
// does, and the divergence registry records it. Eight chelp answers already
// differ that way today.
//
// Until those forty strings land, six correct entries beat nine of which three
// are key names. The read-aloud control below is keyed off ENTRIES, so all nine
// gain it the day the content does.
const ENTRIES = [
  { key: 'e2', icon: '🧺' },
  { key: 'e3', icon: '🛒' },
  { key: 'e4', icon: '🛵' },
  { key: 'e5', icon: '💳' },
  { key: 'e6', icon: '📒' },
  { key: 'e7', icon: '📦' },
];

export default function HelpFaqScreen() {
  const { t, lang } = useT();
  // Which question is expanded. One at a time keeps the list scannable on a
  // small screen; tapping the open one closes it.
  const [open, setOpen] = useState(null);

  // Read the answer out loud, the same way the khata balance does.
  //
  // The web FAQ has had a Listen button per answer for a while (HelpFaq.js) and
  // this screen had none, so the shopper least able to read the answer was the
  // one sent to a browser to hear it. Same hook, same start/stop semantics, same
  // dictionary key as the web's label.
  //
  // Keyed by entry, not by the hook's single `speaking` flag: that flag is one
  // boolean for the whole hook, so gating on it alone would turn every answer's
  // button into Stop at once. Only the answer actually being read shows Stop;
  // tapping another switches to it, because speak() replaces rather than queues.
  const voice = useNativeVoice(lang);
  const [speakingKey, setSpeakingKey] = useState('');
  const isSaying = (key) => voice.speaking && speakingKey === key;

  const sayAnswer = (key) => {
    if (isSaying(key)) { voice.stopSpeaking(); setSpeakingKey(''); return; }
    setSpeakingKey(key);
    voice.speak(t(`chelp.${key}.a`));
  };

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
            {expanded ? (
              <View>
                <Text style={styles.a}>{t(`chelp.${e.key}.a`)}</Text>
                {/* Gated on ttsSupported, NOT `supported` — that one is speech
                    RECOGNITION, a different capability that also asks for the
                    microphone. Reading aloud needs no permission. Hidden
                    entirely when the device cannot speak, rather than offering a
                    button that does nothing. Its own Pressable, so a tap here
                    reads the answer instead of collapsing it. */}
                {voice.ttsSupported ? (
                  <Pressable
                    onPress={() => sayAnswer(e.key)}
                    hitSlop={8}
                    style={styles.listenBtn}
                    accessibilityRole="button"
                    accessibilityLabel={isSaying(e.key) ? t('common.stop') : t('help.listen')}
                  >
                    <Text style={styles.listenText}>
                      {isSaying(e.key) ? `⏹ ${t('common.stop')}` : `🔊 ${t('help.listen')}`}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
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
  // A real target under the answer, the same 44px the khata read-aloud uses.
  listenBtn: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
    // cardAlt, not bg: this button sits INSIDE a Card, and bg is the same colour
    // the Card sits on, which would have left it invisible.
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 10,
  },
  listenText: { color: colors.text, fontSize: 15, fontWeight: '600' },
});
