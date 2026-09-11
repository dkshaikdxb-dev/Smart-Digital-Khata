import { useCallback, useEffect, useRef, useState } from 'react';
import { useLang } from './i18n';
import { useSpeech } from './useSpeech';

// Shared consumer voice-search behaviour, factored out of the four consumer
// search callers (c/products, c/shops, c/shop/[shopId]) so the mic gives REAL
// feedback everywhere instead of silently doing nothing:
//   - a visible "Listening…" affordance while recognition is active;
//   - a specific, localized message when a cycle ends WITHOUT a transcript —
//     denied mic / nothing-heard / offline / other — mapped from useSpeech's
//     `lastError` + `lastStatus`;
//   - HONEST iOS handling: webkitSpeechRecognition exists on iOS but never
//     actually recognizes, so on that device the mic shows an "isn't supported
//     on iPhone yet" line on tap instead of a dead no-op.
//
// It layers on top of useSpeech and does NOT change the happy path: on a
// supported+reliable browser, `start` calls listen() exactly as before and the
// caller's onResult still fills + runs the search.

const HINT_MS = 6000; // auto-clear an idle feedback line after a few seconds

// Map a finished-without-transcript recognition to a localized message key.
function reasonKey(lastError, lastStatus) {
  switch (lastError) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'voice.err.denied';
    case 'network':
      return 'voice.err.network';
    case 'no-speech':
      return 'voice.err.empty';
    case null:
    case undefined:
    case '':
      // No error reason: recognition ran but heard nothing (empty), or the
      // browser threw silently on start(). Treat as "didn't catch that".
      return 'voice.err.empty';
    default:
      return lastStatus === 'empty' ? 'voice.err.empty' : 'voice.err.generic';
  }
}

// onResult(transcript, meta) is invoked ONLY on a real transcript (same contract
// as before). Returns { sttSupported, listening, hint, start } — the caller gates
// the mic on sttSupported + its own language capability, drives the pulse/label
// with `listening`, renders `hint` under the search bar, and wires the mic tap
// to `start`.
export function useVoiceSearch(onResult) {
  const { t } = useLang();
  const {
    listen, listening, sttSupported, voiceSupport, lastError, lastStatus,
  } = useSpeech();
  const [hint, setHint] = useState('');

  const gotResultRef = useRef(false);
  const prevListeningRef = useRef(false);
  const timerRef = useRef(null);

  const showHint = useCallback((msg) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setHint(msg);
    if (msg) timerRef.current = setTimeout(() => setHint(''), HINT_MS);
  }, []);

  // When a listen session ENDS (listening true → false) without a transcript,
  // surface the specific reason. Mirrors the owner AskShop "try again" pattern,
  // but visual rather than spoken.
  useEffect(() => {
    const was = prevListeningRef.current;
    prevListeningRef.current = listening;
    if (was && !listening && !gotResultRef.current) {
      showHint(t(reasonKey(lastError, lastStatus)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const start = useCallback(() => {
    // HONEST iOS handling: recognition is present but never actually works on
    // iOS WebKit, so say so instead of a dead no-op.
    if (voiceSupport && voiceSupport.supported && !voiceSupport.reliable) {
      showHint(t('voice.err.ios'));
      return;
    }
    gotResultRef.current = false;
    showHint(''); // clear any prior message; the caller shows "Listening…" now
    listen((tx, meta) => {
      gotResultRef.current = true;
      showHint('');
      if (typeof onResult === 'function') onResult(tx, meta);
    });
  }, [listen, onResult, voiceSupport, showHint, t]);

  return { sttSupported, listening, hint, start };
}
