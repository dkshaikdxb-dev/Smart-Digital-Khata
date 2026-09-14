import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';
import api from '../services/api';
import { useNativeVoice, isLocaleSupported } from '../lib/useNativeVoice';
import { useT } from '../i18n';

// Owner "Ask" — a voice question on the owner home. The owner taps the mic,
// SPEAKS a question about their shop and HEARS a one-line answer read aloud.
// Built ONLY on the OS-native voice hook (useNativeVoice: STT via listen(), TTS
// via speak()); matching is pure keyword rules, nothing generative. The intent
// grammar is PORTED verbatim from
// admin-dashboard/src/components/AskShop.js (same INTENTS / matchIntent /
// resolveCustomer / answerFor), so the owner web console and the native app give
// identical, deterministic, debuggable answers.
//
// HONESTY about the limits (deliberate, not a bug):
//  - Shown ONLY when the device can both recognize speech AND read aloud
//    (voice.supported). Otherwise it renders nothing — never a dead button.
//  - Indic-language STT is patchy: recognition can return an empty transcript or
//    error out. listen() only calls back on a real transcript, so when a session
//    ends without one we speak a gentle "please try again".
//  - Intent matching is SIMPLE and DETERMINISTIC: lower-case the transcript and
//    test it against a small keyword set per intent (owner language + Hindi-Latin
//    + English), first match wins. An unmatched question gets a friendly
//    fallback naming a couple of example questions.
//
// Answers are authored inline for en + hi; every other recognizer locale falls
// back to the English answers.
//
// KEYWORDS (batch LANG): Bengali and Gujarati keywords are added below so the mic
// is USEFUL in those languages and not merely enabled. MARATHI shares the
// Devanagari script — and most of this vocabulary — with Hindi, so the Hindi
// keywords already match a Marathi question ("बाकी", "उधार", "जमा", "वसूल",
// "क्रेडिट", "इनाम", "प्लान", "लिंक", "सप्ताह" are the same words); only the few
// genuinely Marathi forms ("कोण", "किती लोक", "वसुली", "आठवड्यात", "सर्वात जास्त")
// are added, rather than duplicating what already matches.

// Ordered intents — PORTED from the admin dashboard. The FIRST intent whose
// keywords appear in the transcript wins (order matters where keywords overlap).
const INTENTS = [
  {
    id: 'weekSummary',
    keywords: [
      'is hafte', 'hafte', 'is week', 'this week', 'week', 'saptah', 'weekly',
      'इस हफ्ते', 'इस हफ़्ते', 'हफ्ते', 'हफ़्ते', 'सप्ताह', 'साप्ताहिक',
      // bn / gu / mr (Marathi: 'सप्ताह' above already matches)
      'এই সপ্তাহে', 'সপ্তাহে', 'সপ্তাহ',
      'આ અઠવાડિયે', 'અઠવાડિયે', 'અઠવાડિયું',
      'या आठवड्यात', 'आठवड्यात', 'आठवडा',
    ],
  },
  {
    id: 'collection',
    keywords: [
      'collection', 'collected', 'collect', 'jama', 'vasool', 'vasuli', 'vasooli',
      'जमा', 'वसूली', 'वसूल', 'कितना आया', 'aaj kitna', 'today',
      // bn / gu / mr (Marathi: 'जमा' and 'वसूल' above already match)
      'আদায়', 'জমা', 'আজ কত',
      'વસૂલી', 'વસૂલ', 'જમા', 'આજે કેટલા',
      'वसुली', 'आज किती',
    ],
  },
  {
    id: 'bestSeller',
    keywords: [
      'best', 'best seller', 'bestseller', 'sabse zyada', 'sabse jyada', 'zyada bika',
      'popular', 'top', 'सबसे ज़्यादा', 'सबसे अधिक', 'सबसे ज्यादा', 'बिका', 'बिकने',
      // bn / gu / mr
      'সবচেয়ে বেশি', 'বেশি বিক্রি',
      'સૌથી વધુ', 'વધુ વેચાય',
      'सर्वात जास्त', 'जास्त विकला',
    ],
  },
  {
    id: 'whoOwes',
    keywords: [
      'kaun', 'who', 'kitne log', 'kitne customer', 'kitne grahak', 'how many',
      'कौन', 'कितने लोग', 'कितने ग्राहक', 'कितने कस्टमर',
      // bn / gu / mr. Bengali 'কে' (who) is deliberately NOT a keyword: it is a
      // substring of ordinary words like 'থেকে', so it would match everything.
      'কারা', 'কতজন', 'কত জন',
      'કોણ', 'કેટલા લોકો', 'કેટલા ગ્રાહક',
      'कोण', 'किती लोक', 'किती ग्राहक',
    ],
  },
  {
    id: 'myPlan',
    keywords: [
      'mera plan', 'plan kya', 'plan', 'subscription', 'membership',
      'मेरा प्लान', 'प्लान', 'सदस्यता',
      // bn / gu (Marathi: 'प्लान' above already matches)
      'আমার প্ল্যান', 'প্ল্যান',
      'મારો પ્લાન', 'પ્લાન',
    ],
  },
  {
    id: 'storeLink',
    keywords: [
      'dukaan ka link', 'dukaan link', 'store link', 'shop link', 'share link',
      'meri dukaan', 'link', 'दुकान का लिंक', 'दुकान लिंक', 'स्टोर लिंक', 'लिंक',
      // bn / gu (Marathi: 'लिंक' above already matches)
      'দোকানের লিঙ্ক', 'লিঙ্ক', 'লিংক',
      'દુકાનની લિંક', 'લિંક',
    ],
  },
  {
    id: 'credits',
    keywords: [
      'inaam', 'mere inaam', 'khata credit', 'khata credits', 'credits', 'credit',
      'reward', 'rewards', 'इनाम', 'खाता क्रेडिट', 'क्रेडिट', 'रिवॉर्ड', 'रिवार्ड',
      // bn / gu (Marathi: 'क्रेडिट' and 'इनाम' above already match)
      'খাতা ক্রেডিট', 'ক্রেডিট', 'ইনাম',
      'ખાતા ક્રેડિટ', 'ક્રેડિટ', 'ઇનામ',
    ],
  },
  {
    id: 'outstanding',
    keywords: [
      'outstanding', 'baaki', 'baki', 'bakaya', 'udhaar', 'udhar', 'pending', 'due', 'lena',
      'बाकी', 'बकाया', 'उधार', 'कितना लेना', 'लेना है',
      // bn / gu / mr (Marathi: 'बाकी' and 'उधार' above already match, and
      // 'उधारी' contains 'उधार')
      'বাকি', 'বকেয়া', 'ধার', 'উধার',
      'બાકી', 'ઉધાર', 'કેટલા લેવાના',
      'किती येणे',
    ],
  },
];

function matchIntent(transcript) {
  const t = String(transcript || '').toLowerCase();
  if (!t.trim()) return null;
  for (const intent of INTENTS) {
    if (intent.keywords.some((k) => t.includes(String(k).toLowerCase()))) return intent.id;
  }
  return null;
}

// Every keyword across every intent, plus common fillers / possessives / query
// words, all lower-cased. resolveCustomer() strips these so what remains is JUST
// a spoken customer name (if any).
const NAME_STOPWORDS = new Set([
  ...INTENTS.flatMap((i) => i.keywords),
  'ka', 'ki', 'ke', 'का', 'की', 'के', 'kitna', 'kitni', 'कितना', 'कितनी',
  'hai', 'है', 'ho', 'kya', 'क्या', 'of', 'how', 'much', 'the', 'is', 'me',
  'mera', 'meri', 'mere', 'मेरा', 'मेरी', 'मेरे', 'balance', 'बैलेंस', 'baqi',
  'tell', 'show', 'batao', 'बताओ', 'remaining', 'left', 'kaa', 'naam', 'नाम',
  // bn / gu / mr fillers, possessives and question words, so a spoken customer
  // name survives the strip in those languages exactly as it does in Hindi.
  'কত', 'কি', 'কী', 'আমার', 'হয়েছে', 'আছে', 'এর', 'নাম',
  'કેટલા', 'કેટલી', 'શું', 'મારું', 'મારો', 'મારી', 'છે', 'નામ',
  'किती', 'काय', 'माझा', 'माझी', 'माझे', 'आहे', 'नाव',
].map((k) => String(k).toLowerCase()));

// A per-customer balance question names a real customer AND asks about a balance.
// Strip every known keyword/filler token; whatever remains is the spoken name
// candidate. Matching is case-insensitive, trimmed, and includes-both-ways.
// Returns { customer } | { asked:true } | {}. Never throws, never fabricates.
function resolveCustomer(transcript, customers) {
  const t = String(transcript || '').toLowerCase().trim();
  if (!t) return {};
  const candidate = t
    .split(/[\s,./!?;:]+/)
    .filter((w) => w && w.length >= 2 && !NAME_STOPWORDS.has(w))
    .join(' ')
    .trim();
  if (!candidate) return {};
  const list = Array.isArray(customers) ? customers : [];
  for (const c of list) {
    const name = String((c && c.name) || '').toLowerCase().trim();
    if (name && (candidate.includes(name) || name.includes(candidate))) return { customer: c };
  }
  return { asked: true };
}

// Integer paise → Indian-grouped rupee STRING (no ₹ — the answer template carries
// the symbol). Whole rupees have no decimals; otherwise two places.
function fmtRupees(paise) {
  const r = Number(paise || 0) / 100;
  return Number.isInteger(r)
    ? r.toLocaleString('en-IN')
    : r.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Inline en + hi answer strings (ported from the admin i18n ask.* keys). Every
// other supported locale falls back to en.
const STRINGS = {
  en: {
    button: 'Ask',
    // Transcribed, not translated: this is the 'own.stop' string already
    // written by a human and shipped in admin-dashboard/src/lib/i18n.js.
    stop: 'Stop',
    prompt: 'Tap and ask about your shop',
    listening: 'Listening…',
    tryAgain: 'Sorry, I did not catch that. Please try again.',
    fallback: 'Try asking: today’s collection, or how much is pending.',
    'answer.collection': 'Today you have collected ₹{amount}.',
    'answer.outstanding': '₹{amount} is still to be collected from {n} customers.',
    'answer.whoOwes': '{n} customers still owe you money.',
    'answer.bestSeller': 'Your best seller is {item}.',
    'answer.bestSellerNone': 'No sales recorded yet, so there is no best seller.',
    'answer.custBalance': '{name} owes you ₹{amount}.',
    'answer.custNotFound': 'I could not find that customer — please say the name again.',
    'answer.myPlan': 'Your current plan is {plan}.',
    'answer.credits': 'Your Khata Credits reward balance is ₹{amount}.',
    'answer.storeLink': 'Your store link is shown on screen.',
    'answer.weekSummary': 'This week you have collected ₹{amount}.',
    'answer.notAvailable': 'That is not available right now — please try again.',
    'plan.free': 'Free',
    'plan.pro': 'Pro',
    'plan.family': 'Family',
  },
  hi: {
    button: 'पूछें',
    stop: 'रोकें',
    prompt: 'दबाएँ और अपनी दुकान के बारे में पूछें',
    listening: 'सुन रहे हैं…',
    tryAgain: 'माफ़ करें, समझ नहीं आया। फिर से बोलें।',
    fallback: 'ऐसे पूछें: आज की वसूली, या कितना बाकी है।',
    'answer.collection': 'आज तक ₹{amount} जमा हुआ है।',
    'answer.outstanding': '{n} ग्राहकों से ₹{amount} अभी वसूलना बाकी है।',
    'answer.whoOwes': '{n} ग्राहकों पर अभी उधार बाकी है।',
    'answer.bestSeller': 'सबसे ज़्यादा बिका {item}।',
    'answer.bestSellerNone': 'अभी कोई बिक्री दर्ज नहीं है, इसलिए कोई सबसे ज़्यादा बिकने वाला नहीं है।',
    'answer.custBalance': '{name} पर ₹{amount} बाकी है।',
    'answer.custNotFound': 'वह ग्राहक नहीं मिला — कृपया नाम फिर से बोलें।',
    'answer.myPlan': 'आपका मौजूदा प्लान {plan} है।',
    'answer.credits': 'आपका खाता क्रेडिट इनाम बैलेंस ₹{amount} है।',
    'answer.storeLink': 'आपकी दुकान का लिंक स्क्रीन पर दिख रहा है।',
    'answer.weekSummary': 'इस हफ़्ते आपने ₹{amount} जमा किया है।',
    'answer.notAvailable': 'यह अभी उपलब्ध नहीं है — कृपया फिर से कोशिश करें।',
    'plan.free': 'फ्री',
    'plan.pro': 'प्रो',
    'plan.family': 'फैमिली',
  },
};

function interpolate(str, vars) {
  if (!vars) return str;
  return String(str).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}

// Best-effort device language (2-letter), falling back to 'en'. Never throws.
// Mirrors the consumer i18n deviceLang() so the owner Ask picks a sensible
// recognizer locale + answer language without a language picker.
function deviceLang() {
  try {
    let loc = '';
    if (Platform.OS === 'ios') {
      const s = NativeModules.SettingsManager && NativeModules.SettingsManager.settings;
      loc = (s && (s.AppleLocale || (s.AppleLanguages && s.AppleLanguages[0]))) || '';
    } else {
      loc = (NativeModules.I18nManager && NativeModules.I18nManager.localeIdentifier) || '';
    }
    return String(loc).slice(0, 2).toLowerCase();
  } catch (e) {
    return 'en';
  }
}

export default function AskShop() {
  // The language the owner CHOSE in Settings comes first; the device language is
  // the fallback for an owner who never opened the picker. Answers are en unless
  // the language is Hindi.
  //
  // "Can we recognize this language" has ONE source of truth: the BCP-47 map in
  // useNativeVoice, read through isLocaleSupported(). This used to be a second
  // hardcoded list right here, and it silently disagreed with that map — it still
  // excluded bn/gu/mr after they were mapped, so a Bengali owner would have got
  // English recognition on a Bengali app.
  const { lang: uiLang } = useT();
  const voiceLang = useMemo(() => {
    if (isLocaleSupported(uiLang)) return String(uiLang).slice(0, 2).toLowerCase();
    const two = deviceLang();
    return isLocaleSupported(two) ? two : 'en';
  }, [uiLang]);
  // The language the ANSWER is spoken in, which is NOT always the language the
  // question was heard in: answers are authored for en + hi only, so for every
  // other recognizer locale the reply is English and must be READ ALOUD in
  // English. Handing English words to a Bengali or Tamil voice produces noise.
  const answerLang = STRINGS[voiceLang] ? voiceLang : 'en';
  const strings = STRINGS[answerLang];
  const tr = (key, vars) => interpolate(strings[key] != null ? strings[key] : STRINGS.en[key] != null ? STRINGS.en[key] : key, vars);

  const voice = useNativeVoice(voiceLang);
  const [answer, setAnswer] = useState('');
  const [active, setActive] = useState(false);
  const gotResultRef = useRef(false);

  // Turn a matched intent + data into a localized answer. Returns { display, speak }:
  // most are identical, but a store LINK is awkward to read aloud, so we SHOW the
  // URL and SPEAK a short "it's on screen" phrase.
  function answerFor(intentId, data) {
    const one = (s) => ({ display: s, speak: s });
    switch (intentId) {
      case 'collection':
        return one(tr('answer.collection', { amount: fmtRupees(data.collections_paise) }));
      case 'outstanding':
        return one(tr('answer.outstanding', { amount: fmtRupees(data.outstanding_paise), n: data.debtors }));
      case 'whoOwes':
        return one(tr('answer.whoOwes', { n: data.debtors }));
      case 'bestSeller':
        return one(data.top_item
          ? tr('answer.bestSeller', { item: data.top_item })
          : tr('answer.bestSellerNone'));
      case 'myPlan': {
        if (!data.plan) return one(tr('answer.notAvailable'));
        const key = `plan.${data.plan}`;
        const label = tr(key);
        return one(tr('answer.myPlan', { plan: label === key ? data.plan : label }));
      }
      case 'credits':
        return one(tr('answer.credits', { amount: fmtRupees(data.credits_paise) }));
      case 'storeLink':
        return data.store_link
          ? { display: data.store_link, speak: tr('answer.storeLink') }
          : one(tr('answer.notAvailable'));
      case 'weekSummary':
        return one(data.week_available
          ? tr('answer.weekSummary', { amount: fmtRupees(data.week_collections_paise) })
          : tr('answer.notAvailable'));
      default:
        return one(tr('fallback'));
    }
  }

  // Fetch the numbers the answers need via the native `api` client. Reuses the
  // SAME owner endpoints as the admin dashboard, each settled independently with
  // Promise.allSettled so ONE failing endpoint only degrades ITS OWN intent.
  async function loadData() {
    const get = (url) => api.get(url).then((r) => r.data);
    const [today, outstanding, insights, sub, wallet, shop, weekly] = await Promise.allSettled([
      get('/api/summaries/today'),
      get('/api/summaries/outstanding'),
      get('/api/insights/owner'),
      get('/api/subscriptions/me'),
      get('/api/referral/wallet'),
      get('/api/shops/me'),
      get('/api/insights/owner/weekly'),
    ]);
    const t2 = today.status === 'fulfilled' ? today.value : {};
    const o = outstanding.status === 'fulfilled' ? outstanding.value : {};
    const ins = insights.status === 'fulfilled' ? insights.value : {};
    const s = sub.status === 'fulfilled' ? sub.value : {};
    const w = wallet.status === 'fulfilled' ? wallet.value : {};
    const sh = shop.status === 'fulfilled' ? shop.value : {};
    const wk = weekly.status === 'fulfilled' ? weekly.value : {};
    const topNudge = Array.isArray(ins.nudges) ? ins.nudges.find((n) => n.id === 'top_item') : null;
    const customers = Array.isArray(o.customers) ? o.customers : [];
    // Store link from the consumer web base + shop id (mirrors the web /c/shop/:id).
    const shopId = sh && sh.shop ? sh.shop.id : null;
    const consumerUrl = (Constants.expoConfig && Constants.expoConfig.extra && Constants.expoConfig.extra.consumerUrl) || '';
    const storeLink = shopId && consumerUrl ? `${consumerUrl}/shop/${shopId}` : null;
    return {
      collections_paise: Number(t2.collections || 0),
      outstanding_paise: Number(o.total || 0),
      debtors: customers.length,
      customers,
      top_item: topNudge && topNudge.vars ? topNudge.vars.item : null,
      plan: (s && s.subscription && s.subscription.plan) || null,
      credits_paise: Number((w && w.balance_paise) || 0),
      store_link: storeLink,
      week_collections_paise: Number((wk && wk.summary && wk.summary.collected_paise) || 0),
      week_available: weekly.status === 'fulfilled' && !!(wk && wk.summary),
    };
  }

  async function handleTranscript(transcript) {
    // Ignore any further results once one has been handled this listen cycle —
    // a recognizer that emits multiple final results must not process the
    // transcript (or speak) twice. The guard is reset in startAsk().
    if (gotResultRef.current) return;
    gotResultRef.current = true;
    try {
      const data = await loadData();
      const intentId = matchIntent(transcript);
      let reply;
      // Per-customer balance is considered ONLY when the generic outstanding
      // intent (or no intent) matched — it must never override the others.
      if (intentId === 'outstanding' || intentId === null) {
        const cust = resolveCustomer(transcript, data.customers);
        if (cust.customer) {
          const line = tr('answer.custBalance', {
            name: cust.customer.name,
            amount: fmtRupees(Number(cust.customer.balance || 0)),
          });
          reply = { display: line, speak: line };
        } else if (cust.asked) {
          reply = { display: tr('answer.custNotFound'), speak: tr('answer.custNotFound') };
        } else {
          reply = answerFor(intentId, data);
        }
      } else {
        reply = answerFor(intentId, data);
      }
      setAnswer(reply.display);
      voice.speak(reply.speak, answerLang);
    } catch (e) {
      const msg = tr('tryAgain');
      setAnswer(msg);
      voice.speak(msg, answerLang);
    } finally {
      setActive(false);
    }
  }

  function startAsk() {
    gotResultRef.current = false;
    setAnswer('');
    setActive(true);
    voice.listen((transcript) => { handleTranscript(transcript); });
  }

  // A listen session that ENDS without a transcript (silent / errored / patchy
  // Indic STT) speaks a gentle "try again" — never a crash, never silence.
  const prevListeningRef = useRef(false);
  useEffect(() => {
    const was = prevListeningRef.current;
    prevListeningRef.current = voice.listening;
    if (was && !voice.listening && active && !gotResultRef.current) {
      setActive(false);
      const msg = tr('tryAgain');
      setAnswer(msg);
      voice.speak(msg, answerLang);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.listening]);

  // Shown ONLY when this device can recognize speech (and read aloud). Hidden
  // entirely otherwise — no dead button.
  if (!voice.supported) return null;

  return (
    <View style={s.card}>
      {/* While the reply is being read out, the same spot becomes Stop. One
          control, not two: a second button sitting dead most of the time is
          noise on a small screen, and the only thing worth doing mid-answer is
          silencing it. It is styled as a plain neutral button rather than the
          accent green, because green here means go. */}
      {voice.speaking ? (
        <Pressable
          onPress={voice.stopSpeaking}
          style={({ pressed }) => [s.askBtn, s.stopBtn, pressed && s.askBtnActive]}
          accessibilityRole="button"
          accessibilityLabel={tr('stop')}
        >
          <Text style={s.askIcon}>⏹</Text>
          <Text style={s.stopText}>{tr('stop')}</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={startAsk}
          disabled={voice.listening}
          style={({ pressed }) => [s.askBtn, (pressed || voice.listening) && s.askBtnActive]}
          accessibilityRole="button"
          accessibilityLabel={tr('button')}
        >
          <Text style={s.askIcon}>🎤</Text>
          <Text style={s.askText}>{tr('button')}</Text>
        </Pressable>
      )}
      <Text style={s.answer} numberOfLines={3}>
        {voice.listening ? tr('listening') : (answer || tr('prompt'))}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  askBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#22c55e',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  askBtnActive: { opacity: 0.7 },
  // Neutral slate, not the accent: this button stops something rather than
  // starting it. Near-white label so it stays readable outdoors, which the dark
  // on-accent ink would not be on this fill.
  stopBtn: { backgroundColor: '#475569' },
  stopText: { color: '#f8fafc', fontWeight: '700', fontSize: 16 },
  askIcon: { fontSize: 18 },
  askText: { color: '#000', fontWeight: '700', fontSize: 16 },
  answer: { flex: 1, color: '#e2e8f0', fontSize: 14 },
});
