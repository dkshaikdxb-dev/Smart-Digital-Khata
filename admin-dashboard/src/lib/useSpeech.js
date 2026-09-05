import { useCallback, useMemo, useRef, useState } from 'react';
import { getLang } from './i18n';

// Voice input/output for the rural audience, built on ONLY the browser Web Speech
// API — no libraries. Speech-to-text uses SpeechRecognition (webkit-prefixed on
// Chrome/Android WebView); text-to-speech uses speechSynthesis. Every call is
// wrapped in try/catch and no-ops when its API is missing, so a page never breaks
// on a device without support. Callers hide their voice buttons using the
// `sttSupported` / `ttsSupported` flags (or `supported` for "either").

// Map the current UI language to a BCP-47 tag for both recognition + synthesis.
const BCP47 = {
  en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN', te: 'te-IN', kn: 'kn-IN', ml: 'ml-IN', ur: 'ur-IN',
};

function langTag() {
  return BCP47[getLang()] || 'en-IN';
}

// Pull the FIRST number out of a spoken transcript. Strips commas, ₹ and spaces,
// then matches a bare integer or decimal. Returns null when nothing parses, so a
// caller can leave its field untouched.
export function extractFirstNumber(text) {
  if (text == null) return null;
  const cleaned = String(text).replace(/[,₹\s]/g, '');
  const m = cleaned.match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

export function useSpeech() {
  const recRef = useRef(null);
  const [listening, setListening] = useState(false);

  // Feature-detect once. During SSR `window` is undefined → everything is off,
  // and buttons stay hidden until the client re-renders with real capabilities.
  const flags = useMemo(() => {
    if (typeof window === 'undefined') return { stt: false, tts: false };
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    return { stt: !!SR, tts: !!window.speechSynthesis };
  }, []);

  const stop = useCallback(() => {
    try {
      if (recRef.current) recRef.current.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }, []);

  const listen = useCallback((onResult) => {
    if (typeof window === 'undefined') return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    try {
      const rec = new SR();
      recRef.current = rec;
      rec.lang = langTag();
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.continuous = false;
      rec.onresult = (e) => {
        try {
          const transcript = (e.results && e.results[0] && e.results[0][0] && e.results[0][0].transcript) || '';
          if (transcript && typeof onResult === 'function') onResult(transcript.trim());
        } catch {
          /* ignore a malformed result */
        }
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      setListening(true);
      rec.start();
    } catch {
      // Some browsers throw if start() is called twice or permission is denied.
      setListening(false);
    }
  }, []);

  const speak = useCallback((text) => {
    if (typeof window === 'undefined' || !window.speechSynthesis || !text) return;
    try {
      const u = new window.SpeechSynthesisUtterance(String(text));
      u.lang = langTag();
      // Cancel anything queued so repeated taps don't stack up.
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  }, []);

  return {
    supported: flags.stt || flags.tts,
    sttSupported: flags.stt,
    ttsSupported: flags.tts,
    listening,
    listen,
    stop,
    speak,
  };
}
