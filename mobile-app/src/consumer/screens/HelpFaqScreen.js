import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { colors, sizes } from '../theme';
import { Card } from '../components';
import { useT } from '../i18n';
import { useNativeVoice } from '../../lib/useNativeVoice';

// Help & FAQ — a static, collapsible list of the questions a shopper actually
// asks. NOT a bot, no network, works with the phone in flight mode, and every
// answer is translated into all ten languages — six copied whole from the web
// app's own chelp.* entries, three written for this app (see below).
//
// ALL NINE ENTRIES, with app-specific answers for three of them.
//
// e1, e8 and e9 exist in the WEB dictionary only, and their web answers describe
// controls this app does not have — "Use my location", a language switch "at the
// top", a sun/moon toggle. Showing them with the web text would have sent a
// shopper hunting for buttons that are not there; showing them with no app text
// at all printed the key name, which is how they were briefly shipped and pulled.
//
// So the app now carries its own chelp.e1.a, chelp.e8.a, chelp.e9.q and
// chelp.e9.a: same namespace, different value from the web, recorded in the
// divergence registry as consumer-faq-app-variants. The six other answers are
// unchanged and still shared with the web.
//
// THE ENGLISH IS APPROVED. THE NINE TRANSLATIONS OF EACH ARE NOT — they are
// machine-authored and carry REVIEW status in scripts/i18n-decisions.json. They
// name the real on-screen labels in each language (Telugu's Account tab reads
// ప్రొఫైల్, so the Telugu answer says ప్రొఫైల్), and they keep the microphone
// instruction conditional, because both mics are hidden on a device with no
// recognizer for the active language.
const ENTRIES = [
  { key: 'e1', icon: '🔍' },
  { key: 'e2', icon: '🧺' },
  { key: 'e3', icon: '🛒' },
  { key: 'e4', icon: '🛵' },
  { key: 'e5', icon: '💳' },
  { key: 'e6', icon: '📒' },
  { key: 'e7', icon: '📦' },
  { key: 'e8', icon: '🌐' },
  { key: 'e9', icon: '🌗' },
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
