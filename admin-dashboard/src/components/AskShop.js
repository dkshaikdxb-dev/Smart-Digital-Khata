import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useLang } from '../lib/i18n';
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
// baaki" is who-owes, checked before the plain outstanding intent). Keywords cover
// the owner's spoken language plus common Hindi-in-Latin and English phrasings.
const INTENTS = [
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

// Integer paise → Indian-grouped rupee STRING (no ₹ — the answer template carries
// the symbol). Whole rupees have no decimals; otherwise two places.
function fmtRupees(paise) {
  const r = Number(paise || 0) / 100;
  return Number.isInteger(r)
    ? r.toLocaleString('en-IN')
    : r.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AskShop() {
  const { t } = useLang();
  const { listen, speak, listening, sttSupported, ttsSupported } = useSpeech();
  const [answer, setAnswer] = useState('');
  const [active, setActive] = useState(false); // an ask session is in flight

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

  // Fetch the numbers the answers need. Reuses the SAME endpoints the owner home
  // already calls — today's summary, the outstanding list, and the Phase F nudges
  // (for the best seller). Returns a plain object; never throws to the caller.
  async function loadData() {
    const [today, outstanding, insights] = await Promise.allSettled([
      apiFetch('/api/summaries/today'),
      apiFetch('/api/summaries/outstanding'),
      apiFetch('/api/insights/owner'),
    ]);
    const t2 = today.status === 'fulfilled' ? today.value : {};
    const o = outstanding.status === 'fulfilled' ? outstanding.value : {};
    const ins = insights.status === 'fulfilled' ? insights.value : {};
    const topNudge = Array.isArray(ins.nudges) ? ins.nudges.find((n) => n.id === 'top_item') : null;
    return {
      collections_paise: Number(t2.collections || 0),
      outstanding_paise: Number(o.total || 0),
      debtors: Array.isArray(o.customers) ? o.customers.length : 0,
      top_item: topNudge && topNudge.vars ? topNudge.vars.item : null,
    };
  }

  // Turn a matched intent + data into a localized one-line answer string.
  function answerFor(intentId, data) {
    switch (intentId) {
      case 'collection':
        return t('ask.answer.collection', { amount: fmtRupees(data.collections_paise) });
      case 'outstanding':
        return t('ask.answer.outstanding', { amount: fmtRupees(data.outstanding_paise), n: data.debtors });
      case 'whoOwes':
        return t('ask.answer.whoOwes', { n: data.debtors });
      case 'bestSeller':
        return data.top_item
          ? t('ask.answer.bestSeller', { item: data.top_item })
          : t('ask.answer.bestSellerNone');
      default:
        return t('ask.fallback');
    }
  }

  async function handleTranscript(transcript) {
    gotResultRef.current = true;
    try {
      const data = await loadData();
      const intentId = matchIntent(transcript);
      const reply = answerFor(intentId, data); // unmatched → friendly fallback
      setAnswer(reply);
      speak(reply);
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

  // Show ONLY when both STT and TTS are supported — a voice ask needs to both
  // hear and speak. Hidden entirely otherwise (no dead button).
  if (!sttSupported || !ttsSupported) return null;

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
