import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useLang, canUseVoice, canReadAloud, useLanguageCapability } from '../lib/i18n';
import { useSpeech } from '../lib/useSpeech';

// Owner Help "lane C" (Batch J): a voice "Ask" on the owner home. The owner taps
// the mic, SPEAKS a question and HEARS a one-line localized answer — built ONLY on
// the shared Web-Speech hook (useSpeech: STT via listen(), TTS via speak()), no
// new dependency.
//
// HONESTY about the limits (this is deliberate, not a bug):
//  - It is shown ONLY when BOTH speech-to-text and text-to-speech are supported
//    (sttSupported && ttsSupported); otherwise it renders nothing, so a device
//    without support never sees a button that cannot work.
//  - Indic-language STT is patchy on many devices: recognition can return an empty
//    transcript or error out entirely. useSpeech.listen() only calls back on a
//    real transcript and flips `listening` back to false on error/end. So when a
//    listen session ends WITHOUT a transcript, we speak a gentle "please try
//    again" (ask.tryAgain) rather than going silent or crashing.
//  - Intent matching is intentionally SIMPLE and DETERMINISTIC: we lower-case the
//    transcript and test it against a small keyword set per intent (owner language
//    + Hindi-Latin + English), first match wins. No fuzzy/AI matching — predictable
//    and debuggable. An unmatched question gets a friendly fallback that names a
//    couple of example questions.

// Ordered intents. Each is tried in turn against the transcript; the FIRST whose
// keywords appear wins (order matters where keywords overlap — e.g. "kitne log
// baaki" is who-owes, checked before the plain outstanding intent, and a week
// qualifier makes weekSummary win over the plain today-collection intent).
// Keywords cover the owner's spoken language plus common Hindi-in-Latin and
// English phrasings. NOTE: the per-customer balance ("custBalance") is NOT a
// keyword intent — it needs a real customer-NAME match, so it is resolved
// separately (resolveCustomer) only when the generic outstanding intent (or no
// intent) matched, and never overrides collection/whoOwes/plan/etc.
const INTENTS = [
  {
    // More specific than `collection`: a week qualifier is present, so this must
    // be tried BEFORE the plain today-collection intent below.
    id: 'weekSummary',
    keywords: [
      'is hafte', 'hafte', 'is week', 'this week', 'week', 'saptah', 'weekly',
      'इस हफ्ते', 'इस हफ़्ते', 'हफ्ते', 'हफ़्ते', 'सप्ताह', 'साप्ताहिक',
    ],
  },
  {
    id: 'collection',
    keywords: [
      'collection', 'collected', 'collect', 'jama', 'vasool', 'vasuli', 'vasooli',
      'जमा', 'वसूली', 'वसूल', 'कितना आया', 'aaj kitna', 'today',
    ],
  },
  {
    id: 'bestSeller',
    keywords: [
      'best', 'best seller', 'bestseller', 'sabse zyada', 'sabse jyada', 'zyada bika',
      'popular', 'top', 'सबसे ज़्यादा', 'सबसे अधिक', 'सबसे ज्यादा', 'बिका', 'बिकने',
    ],
  },
  {
    id: 'whoOwes',
    keywords: [
      'kaun', 'who', 'kitne log', 'kitne customer', 'kitne grahak', 'how many',
      'कौन', 'कितने लोग', 'कितने ग्राहक', 'कितने कस्टमर',
    ],
  },
  {
    id: 'myPlan',
    keywords: [
      'mera plan', 'plan kya', 'plan', 'subscription', 'membership',
      'मेरा प्लान', 'प्लान', 'सदस्यता',
    ],
  },
  {
    id: 'storeLink',
    keywords: [
      'dukaan ka link', 'dukaan link', 'store link', 'shop link', 'share link',
      'meri dukaan', 'link', 'दुकान का लिंक', 'दुकान लिंक', 'स्टोर लिंक', 'लिंक',
    ],
  },
  {
    id: 'credits',
    keywords: [
      'inaam', 'mere inaam', 'khata credit', 'khata credits', 'credits', 'credit',
      'reward', 'rewards', 'इनाम', 'खाता क्रेडिट', 'क्रेडिट', 'रिवॉर्ड', 'रिवार्ड',
    ],
  },
  {
    id: 'outstanding',
    keywords: [
      'outstanding', 'baaki', 'baki', 'bakaya', 'udhaar', 'udhar', 'pending', 'due', 'lena',
      'बाकी', 'बकाया', 'उधार', 'कितना लेना', 'लेना है',
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
// words, all lower-cased. resolveCustomer() strips these from the transcript so
// what remains is JUST a spoken customer name (if any). Kept as a flat Set so the
// per-customer name match can never be fooled by an intent keyword (e.g. the word
// "outstanding" or "baaki") looking like a name.
const NAME_STOPWORDS = new Set([
  ...INTENTS.flatMap((i) => i.keywords),
  // question / filler / possessive words that surround a name in natural speech
  'ka', 'ki', 'ke', 'का', 'की', 'के', 'kitna', 'kitni', 'कितना', 'कितनी',
  'hai', 'है', 'ho', 'kya', 'क्या', 'of', 'how', 'much', 'the', 'is', 'me',
  'mera', 'meri', 'mere', 'मेरा', 'मेरी', 'मेरे', 'balance', 'बैलेंस', 'baqi',
  'tell', 'show', 'batao', 'बताओ', 'remaining', 'left', 'kaa', 'naam', 'नाम',
].map((k) => String(k).toLowerCase()));

// A per-customer balance question is one that names a real customer AND asks
// about a balance. We LOWER-CASE + TRIM, strip every known keyword/filler token,
// and treat whatever is left as the spoken candidate name. Matching against the
// outstanding customers[] is case-insensitive, trimmed, and includes-both-ways
// (so "ramesh kumar" matches "Ramesh" and vice-versa). Returns:
//   { customer }        → a real customer matched (answer name + balance)
//   { asked: true }     → a name was clearly spoken but matched nobody (custNotFound)
//   {}                  → not a per-customer question (fall through to the generic
//                         outstanding / fallback answer)
// This never throws and never fabricates a match.
function resolveCustomer(transcript, customers) {
  const t = String(transcript || '').toLowerCase().trim();
  if (!t) return {};
  // Candidate name = the words left after removing every keyword/filler token.
  const candidate = t
    .split(/[\s,./!?;:]+/)
    .filter((w) => w && w.length >= 2 && !NAME_STOPWORDS.has(w))
    .join(' ')
    .trim();
  if (!candidate) return {}; // nothing name-like remained → generic question
  const list = Array.isArray(customers) ? customers : [];
  for (const c of list) {
    const name = String((c && c.name) || '').toLowerCase().trim();
    if (name && (candidate.includes(name) || name.includes(candidate))) return { customer: c };
  }
  // A name-like token was spoken but matched no customer → gentle "not found".
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

export default function AskShop() {
  const { t, lang } = useLang();
  const { listen, speak, listening, sttSupported, ttsSupported, ttsVoiceAvailable } = useSpeech();
  const caps = useLanguageCapability(lang);
  const [answer, setAnswer] = useState('');
  const [active, setActive] = useState(false); // an ask session is in flight
  // Platform on/off toggle (backend flag, DEFAULT ON). We start optimistic (true)
  // — the flag is only turned OFF when the public config endpoint explicitly says
  // so — and never let the fetch throw. When false the whole control is hidden,
  // exactly like an unsupported device.
  const [flagEnabled, setFlagEnabled] = useState(true);

  useEffect(() => {
    let alive = true;
    apiFetch('/api/public/config')
      .then((cfg) => { if (alive) setFlagEnabled(cfg && cfg.voice_assistant_enabled !== false); })
      .catch(() => { /* default ON on any error — leave flagEnabled true */ });
    return () => { alive = false; };
  }, []);

  // Tracks whether the in-flight listen session produced a transcript, so we can
  // detect a silent/errored recognition and offer "try again".
  const gotResultRef = useRef(false);
  const prevListeningRef = useRef(false);

  // When a listen session ENDS (listening true → false) without a transcript,
  // gently ask the owner to try again. This is the honest degradation for patchy
  // Indic STT — never a crash, never silence.
  useEffect(() => {
    const was = prevListeningRef.current;
    prevListeningRef.current = listening;
    if (was && !listening && active && !gotResultRef.current) {
      setActive(false);
      const msg = t('ask.tryAgain');
      setAnswer(msg);
      speak(msg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening]);

  // Fetch the numbers the answers need. Reuses the SAME endpoints the owner app
  // already calls — today's summary, the outstanding list (also the source of the
  // per-customer names + balances), the Phase F nudges (best seller), plus the
  // small extras the new intents need: subscription, Khata Credits wallet, the
  // shop (for the store link) and the weekly summary. Every request is settled
  // independently with Promise.allSettled so ONE failing endpoint only makes ITS
  // OWN intent degrade gracefully — nothing throws to the caller.
  async function loadData() {
    const [today, outstanding, insights, sub, wallet, shop, weekly] = await Promise.allSettled([
      apiFetch('/api/summaries/today'),
      apiFetch('/api/summaries/outstanding'),
      apiFetch('/api/insights/owner'),
      apiFetch('/api/subscriptions/me'),
      apiFetch('/api/referral/wallet'),
      apiFetch('/api/shops/me'),
      apiFetch('/api/insights/owner/weekly'),
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
    // Origin-relative store link, mirroring settings.js (/c/shop/:id). Guarded for
    // SSR — window is only read inside the browser-only handler path anyway.
    const shopId = sh && sh.shop ? sh.shop.id : null;
    const storeLink = (shopId && typeof window !== 'undefined')
      ? `${window.location.origin}/c/shop/${shopId}`
      : null;
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

  // Turn a matched intent + data into a localized answer. Returns { display, speak }:
  // for most intents the two are identical, but a store LINK is awkward to read
  // aloud, so we SHOW the URL and SPEAK a short "it's on screen" phrase.
  function answerFor(intentId, data) {
    const one = (s) => ({ display: s, speak: s });
    switch (intentId) {
      case 'collection':
        return one(t('ask.answer.collection', { amount: fmtRupees(data.collections_paise) }));
      case 'outstanding':
        return one(t('ask.answer.outstanding', { amount: fmtRupees(data.outstanding_paise), n: data.debtors }));
      case 'whoOwes':
        return one(t('ask.answer.whoOwes', { n: data.debtors }));
      case 'bestSeller':
        return one(data.top_item
          ? t('ask.answer.bestSeller', { item: data.top_item })
          : t('ask.answer.bestSellerNone'));
      case 'myPlan': {
        if (!data.plan) return one(t('ask.answer.notAvailable'));
        // Localized plan label (plan.free / plan.pro / plan.family); an unknown
        // plan code translates to the raw key, so fall back to the code itself.
        const key = `plan.${data.plan}`;
        const label = t(key);
        return one(t('ask.answer.myPlan', { plan: label === key ? data.plan : label }));
      }
      case 'credits':
        return one(t('ask.answer.credits', { amount: fmtRupees(data.credits_paise) }));
      case 'storeLink':
        return data.store_link
          ? { display: data.store_link, speak: t('ask.answer.storeLink') }
          : one(t('ask.answer.notAvailable'));
      case 'weekSummary':
        return one(data.week_available
          ? t('ask.answer.weekSummary', { amount: fmtRupees(data.week_collections_paise) })
          : t('ask.answer.notAvailable'));
      default:
        return one(t('ask.fallback'));
    }
  }

  async function handleTranscript(transcript) {
    gotResultRef.current = true;
    try {
      const data = await loadData();
      const intentId = matchIntent(transcript);
      let reply;
      // Per-customer balance is considered ONLY when the generic outstanding
      // intent (or no intent) matched — it must never override collection /
      // whoOwes / plan / etc, so the existing intents keep working unchanged.
      if (intentId === 'outstanding' || intentId === null) {
        const cust = resolveCustomer(transcript, data.customers);
        if (cust.customer) {
          // Answer from the outstanding row itself, which already carries the
          // per-customer name + balance (paise). No days-pending field exists on
          // that row, so the answer is name + balance only.
          const line = t('ask.answer.custBalance', {
            name: cust.customer.name,
            amount: fmtRupees(Number(cust.customer.balance || 0)),
          });
          reply = { display: line, speak: line };
        } else if (cust.asked) {
          reply = { display: t('ask.answer.custNotFound'), speak: t('ask.answer.custNotFound') };
        } else {
          reply = answerFor(intentId, data); // generic outstanding / friendly fallback
        }
      } else {
        reply = answerFor(intentId, data);
      }
      setAnswer(reply.display);
      speak(reply.speak);
    } catch {
      // Any failure (network, parsing) degrades to try-again rather than crashing.
      const msg = t('ask.tryAgain');
      setAnswer(msg);
      speak(msg);
    } finally {
      setActive(false);
    }
  }

  function startAsk() {
    gotResultRef.current = false;
    setAnswer('');
    setActive(true);
    listen(handleTranscript);
  }

  // Show ONLY when this device AND this language can both hear and speak — a voice
  // ask reads its answer aloud, so it needs recognition for the language, a TTS
  // engine, AND a real local voice (never offer a control that would mis-recognize
  // or speak the wrong language). Hidden entirely otherwise (no dead button).
  if (!sttSupported || !ttsSupported) return null;
  if (!canUseVoice(lang, caps)) return null;
  if (!canReadAloud(lang, caps) || !ttsVoiceAvailable) return null;
  // Backend platform toggle (DEFAULT ON): hidden entirely when explicitly off,
  // the same honest "no dead button" treatment as an unsupported device.
  if (!flagEnabled) return null;

  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <button
        type="button"
        onClick={startAsk}
        disabled={listening}
        aria-label={t('ask.button')}
        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <span aria-hidden="true">🎤</span> {t('ask.button')}
      </button>
      <div className="muted" style={{ flex: 1, minWidth: 160 }}>
        {listening ? t('ask.listening') : (answer || t('ask.prompt'))}
      </div>
    </div>
  );
}
