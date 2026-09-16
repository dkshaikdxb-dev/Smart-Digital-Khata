import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// OS-native voice for the native apps, built on the maintained
// `expo-speech-recognition` (iOS SFSpeechRecognizer + Android SpeechRecognizer)
// for speech-to-text and `expo-speech` for text-to-speech. Free, on-device or
// OS-cloud, no credentials, no accounts.
//
// PUBLIC SURFACE (kept identical to the earlier voice hook so call sites are
// trivial and the honest-error UX carries over unchanged):
//   listen(onResult)      — request permission, start recognition, call
//                           onResult(bestTranscript) on a real result
//   stop()                — stop the current recognition session
//   speak(text, lang)     — read text aloud in `lang` (falls back to the hook
//                           language). Replaces anything already being spoken
//                           rather than queueing behind it.
//   stopSpeaking()        — cut off the current utterance immediately
//   speaking              — boolean, true while the device is reading aloud
//   listening             — boolean, true while a recognition session is live
//   lastError             — null | 'permission' | 'no-match' | 'network' | 'unavailable'
//   supported             — module present AND recognition available on device
//   localeSupported(lang) — whether we map this language to a recognizer locale
//
// NEVER CRASHES. Both native modules are loaded through a guarded require: the
// module's `requireNativeModule(...)` throws at import time when the native code
// is not linked (Expo Go, or a JS reload before the one required EAS rebuild),
// so the require is wrapped in try/catch and the hook simply degrades to
// `supported:false` — call sites hide their mic and nothing throws.

// WHY THERE IS NO PAUSE. expo-speech exposes pause()/resume(), but both are
// documented as unavailable on Android, and Android is effectively the whole
// audience here. A Pause button that silently does nothing on the phones our
// shopkeepers actually hold would be worse than no button, so the control is
// Stop, which works on every device. It ends the utterance outright rather
// than holding it, which is also what someone jabbing at a talking phone in a
// busy shop actually wants.

// --- Guarded module loading (never throws) --------------------------------
let SpeechRecognition = null;
try {
  // Throws via requireNativeModule(...) when the native module is unlinked.
  SpeechRecognition = require('expo-speech-recognition');
} catch (e) {
  SpeechRecognition = null;
}

let Speech = null;
try {
  Speech = require('expo-speech');
} catch (e) {
  Speech = null;
}

const SR = (SpeechRecognition && SpeechRecognition.ExpoSpeechRecognitionModule) || null;
// A real EventEmitter is exported separately; prefer it for addListener since a
// spread of the native module may not carry the prototype's addListener.
const SR_EMITTER = (SpeechRecognition && SpeechRecognition.ExpoSpeechRecognitionModuleEmitter) || null;

// --- Language → BCP-47 recognizer locale ----------------------------------
// All ten UI languages are mapped, bn/gu/mr included (batch LANG): the owner app
// now has real Bengali, Gujarati and Marathi strings, so hiding the mic from those
// shopkeepers was the wrong default.
//
// Mapping a locale is a CLAIM ABOUT THIS APP, not about the handset. Android and
// iOS only recognize (and only speak) a language whose pack the device actually
// has installed. When it is missing, start() fails or the session ends with no
// transcript, and the hook reports `unavailable` — the same honest outcome as an
// unmapped language, surfaced by the same call-site hint — instead of a mic that
// spins forever. See the watchdog in listen() below.
const BCP47 = {
  en: 'en-IN',
  hi: 'hi-IN',
  bn: 'bn-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  kn: 'kn-IN',
  ml: 'ml-IN',
  mr: 'mr-IN',
  gu: 'gu-IN',
  ur: 'ur-IN',
};

// Hard ceiling on a single one-shot recognition session. Generous enough for a
// slow speaker on a slow network, short enough that a silent failure is reported
// rather than waited on forever.
const WATCHDOG_MS = 15000;

function twoLetter(lang) {
  return String(lang || '').slice(0, 2).toLowerCase();
}

function toBcp47(lang) {
  return BCP47[twoLetter(lang)] || null;
}

// The SAME answer as the hook's localeSupported(), available without mounting a
// hook — so a call site choosing a recognizer language before render reads the
// one BCP47 map above instead of keeping a second hardcoded list beside it.
export function isLocaleSupported(lang) {
  const two = twoLetter(lang);
  return !!two && !!BCP47[two];
}

// Map the module's Web-Speech-style error codes to our small stable set so the
// UX only ever reasons about four honest outcomes.
function mapError(code) {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'permission';
    case 'no-speech':
    case 'speech-timeout':
    case 'nomatch':
      return 'no-match';
    case 'network':
      return 'network';
    default:
      // aborted / audio-capture / language-not-supported / busy / client /
      // interrupted / unknown all read as a generic "unavailable".
      return 'unavailable';
  }
}

// Attach a native listener whichever way the installed module exposes it,
// returning a subscription with .remove() (or null). Never throws.
function addListener(name, cb) {
  try {
    if (SR_EMITTER && typeof SR_EMITTER.addListener === 'function') {
      return SR_EMITTER.addListener(name, cb);
    }
    if (SR && typeof SR.addListener === 'function') {
      return SR.addListener(name, cb);
    }
  } catch (e) {
    /* ignore */
  }
  return null;
}

export function useNativeVoice(lang = 'en') {
  const [listening, setListening] = useState(false);
  const [lastError, setLastError] = useState(null);

  const onResultRef = useRef(null);
  const gotResultRef = useRef(false);
  const subsRef = useRef([]);
  // Mirrors `listening` for the watchdog, which reads it from inside a timer
  // callback where the state value would be stale.
  const listeningRef = useRef(false);
  const watchdogRef = useRef(null);

  // `supported` = the STT module is present AND recognition is available on this
  // device. isRecognitionAvailable() is synchronous; if it is missing we treat
  // mere module presence as support (a later start() error degrades honestly).
  const supported = useMemo(() => {
    if (!SR) return false;
    try {
      if (typeof SR.isRecognitionAvailable === 'function') {
        return !!SR.isRecognitionAvailable();
      }
    } catch (e) {
      /* fall through to module-presence */
    }
    return true;
  }, []);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const cleanupListeners = useCallback(() => {
    const subs = subsRef.current;
    subsRef.current = [];
    subs.forEach((s) => {
      try {
        if (s && typeof s.remove === 'function') s.remove();
      } catch (e) {
        /* ignore */
      }
    });
  }, []);

  // Remove any live listeners AND the watchdog timer on unmount.
  useEffect(() => () => {
    clearWatchdog();
    cleanupListeners();
  }, [cleanupListeners, clearWatchdog]);

  const finish = useCallback(() => {
    clearWatchdog();
    listeningRef.current = false;
    setListening(false);
    cleanupListeners();
  }, [cleanupListeners, clearWatchdog]);

  const stop = useCallback(() => {
    if (!SR) return;
    try {
      SR.stop();
    } catch (e) {
      try {
        SR.abort();
      } catch (e2) {
        /* ignore */
      }
    }
  }, []);

  const localeSupported = useCallback((l) => isLocaleSupported(l), []);

  const listen = useCallback(
    async (onResult) => {
      setLastError(null);
      if (!SR) {
        setLastError('unavailable');
        return;
      }
      onResultRef.current = typeof onResult === 'function' ? onResult : null;
      gotResultRef.current = false;

      // 1) Permission (mic + speech recognition). Never throws.
      let granted = false;
      try {
        const res = await SR.requestPermissionsAsync();
        granted = !!(res && res.granted);
      } catch (e) {
        granted = false;
      }
      if (!granted) {
        setLastError('permission');
        return;
      }

      // 2) Wire result / error / nomatch / end listeners for this session.
      cleanupListeners();
      const push = (s) => {
        if (s) subsRef.current.push(s);
      };
      push(
        addListener('result', (event) => {
          try {
            const results = event && event.results;
            const best = Array.isArray(results) && results[0] ? results[0].transcript : '';
            const text = best == null ? '' : String(best).trim();
            if (text) {
              gotResultRef.current = true;
              const cb = onResultRef.current;
              if (cb) cb(text);
            }
          } catch (e) {
            /* ignore a malformed result */
          }
        }),
      );
      push(
        addListener('error', (event) => {
          setLastError(mapError(event && event.error));
          // An error ENDS the session. Some platforms follow it with `end` and
          // some do not — a device missing the bn/gu/mr language pack is exactly
          // the case that reports `language-not-supported` and then goes quiet.
          // Finishing here means the mic never keeps spinning on a dead session.
          finish();
        }),
      );
      push(
        addListener('nomatch', () => {
          if (!gotResultRef.current) setLastError('no-match');
        }),
      );
      push(
        addListener('end', () => {
          finish();
        }),
      );

      // 3) Start. One-shot, final-result-only recognition in the mapped locale
      // (default en-IN so an unmapped language still records rather than throws).
      listeningRef.current = true;
      setListening(true);
      try {
        SR.start({
          lang: toBcp47(lang) || 'en-IN',
          interimResults: false,
          continuous: false,
        });
      } catch (e) {
        setLastError('unavailable');
        finish();
        return;
      }

      // 4) WATCHDOG. A handset without the language pack installed can accept
      // start() and then emit nothing at all — no result, no error, no end. A
      // shopkeeper tapping a mic that never answers is worse than one that says
      // "not available in this language yet", so after WATCHDOG_MS we abort the
      // session and report the honest `unavailable` (unless a transcript already
      // arrived, in which case the session simply ran long and we say nothing).
      clearWatchdog();
      watchdogRef.current = setTimeout(() => {
        watchdogRef.current = null;
        if (!listeningRef.current) return;
        try {
          SR.abort();
        } catch (e) {
          /* ignore */
        }
        if (!gotResultRef.current) setLastError('unavailable');
        finish();
      }, WATCHDOG_MS);
    },
    [lang, cleanupListeners, clearWatchdog, finish],
  );

  // True while the device is actually reading aloud. Driven by expo-speech's own
  // lifecycle callbacks rather than by polling isSpeakingAsync(), so the flag
  // cannot drift out of step with the utterance. A ref shadows the state because
  // the unmount cleanup below runs after the last render and cannot read state.
  const [speaking, setSpeaking] = useState(false);
  const speakingRef = useRef(false);
  const markSpeaking = useCallback((v) => {
    speakingRef.current = v;
    setSpeaking(v);
  }, []);

  // Cut the current utterance off. Safe to call when nothing is speaking, and
  // safe on a device with no TTS module at all.
  const stopSpeaking = useCallback(() => {
    markSpeaking(false);
    if (!Speech) return;
    try {
      // Interrupts what is speaking AND clears anything queued behind it.
      Speech.stop();
    } catch (e) {
      /* best-effort; never throw */
    }
  }, [markSpeaking]);

  const speak = useCallback(
    (text, l) => {
      if (!Speech || !text) return;
      try {
        // Replace, do not queue. Without this, tapping a read-aloud control
        // twice lines up two utterances and the second plays after the first
        // has finished — which reads as the app ignoring the second tap and
        // then talking over itself a minute later.
        try { Speech.stop(); } catch (e) { /* nothing was speaking */ }
        markSpeaking(true);
        Speech.speak(String(text), {
          language: toBcp47(l || lang) || 'en-IN',
          // Every terminal path clears the flag, including the ones that are
          // easy to forget: stopped by us, and failed on a device with no voice
          // for this language. Missing one of these would leave a Stop button
          // on screen with nothing left to stop.
          onDone: () => markSpeaking(false),
          onStopped: () => markSpeaking(false),
          onError: () => markSpeaking(false),
        });
      } catch (e) {
        markSpeaking(false);
      }
    },
    [lang, markSpeaking],
  );

  // Leaving the screen must not leave the phone talking. Without this, opening
  // Ask, hearing the answer start and immediately going back left the reply
  // playing to an empty screen with no way to stop it.
  useEffect(() => {
    return () => {
      if (!speakingRef.current || !Speech) return;
      try {
        Speech.stop();
      } catch (e) {
        /* ignore */
      }
    };
  }, []);

  // Can this device SPEAK? `supported` above answers a different question — it
  // is recognition (STT) only, and the two are genuinely independent: expo-speech
  // can be present where expo-speech-recognition is not, and Apple's recognizer
  // can be a false positive where synthesis works fine. A read-aloud control
  // gated on `supported` would therefore be hidden on devices that can speak and
  // shown, dead, on devices that cannot. Mirrors the web hook's `ttsSupported`.
  const ttsSupported = !!Speech;

  return {
    listen,
    stop,
    speak,
    stopSpeaking,
    speaking,
    listening,
    lastError,
    supported,
    ttsSupported,
    localeSupported,
  };
}

export default useNativeVoice;
