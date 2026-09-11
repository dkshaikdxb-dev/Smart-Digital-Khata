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
//                           language)
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
// Honestly supported today: en/hi/ta/te/kn/ml/ur. bn/gu/mr are deliberately
// NOT mapped — they stay "not yet" until a cloud phase, so localeSupported()
// returns false for them and callers show an honest "not in this language yet".
const BCP47 = {
  en: 'en-IN',
  hi: 'hi-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  kn: 'kn-IN',
  ml: 'ml-IN',
  ur: 'ur-IN',
};

function twoLetter(lang) {
  return String(lang || '').slice(0, 2).toLowerCase();
}

function toBcp47(lang) {
  return BCP47[twoLetter(lang)] || null;
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

  // Remove any live listeners on unmount.
  useEffect(() => cleanupListeners, [cleanupListeners]);

  const finish = useCallback(() => {
    setListening(false);
    cleanupListeners();
  }, [cleanupListeners]);

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

  const localeSupported = useCallback((l) => {
    const two = twoLetter(l);
    if (!two) return false;
    return !!BCP47[two];
  }, []);

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
      }
    },
    [lang, cleanupListeners, finish],
  );

  const speak = useCallback(
    (text, l) => {
      if (!Speech || !text) return;
      try {
        Speech.speak(String(text), { language: toBcp47(l || lang) || 'en-IN' });
      } catch (e) {
        /* TTS is best-effort; never throw */
      }
    },
    [lang],
  );

  return {
    listen,
    stop,
    speak,
    listening,
    lastError,
    supported,
    localeSupported,
  };
}

export default useNativeVoice;
