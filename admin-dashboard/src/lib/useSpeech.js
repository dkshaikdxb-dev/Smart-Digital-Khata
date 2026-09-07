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
  // Read-aloud (TTS) state, kept explicit rather than read off
  // speechSynthesis.speaking/paused (both are flaky on Chrome/Android).
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const lastTextRef = useRef(''); // remembered so Play can re-read from the start
  const utterRef = useRef(null); // the live utterance, to ignore stale onend events
  const pausingRef = useRef(false); // true while an onend is the result of a Pause

  // Feature-detect once. During SSR `window` is undefined → everything is off,
  // and buttons stay hidden until the client re-renders with real capabilities.
  const flags = useMemo(() => {
    if (typeof window === 'undefined') return { stt: false, tts: false };
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    return { stt: !!SR, tts: !!window.speechSynthesis };
  }, []);

  // Hard-stop any read-aloud. cancel() reliably halts audio on every engine
  // (unlike pause()), so it is the backbone of both stop() and pause().
  const cancelTts = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }, []);

  const stop = useCallback(() => {
    try {
      if (recRef.current) recRef.current.stop();
    } catch {
      /* ignore */
    }
    // Also halt any read-aloud so a single Stop clears both voice in + voice out.
    pausingRef.current = false;
    utterRef.current = null;
    cancelTts();
    setListening(false);
    setSpeaking(false);
    setPaused(false);
  }, [cancelTts]);

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
      const synth = window.speechSynthesis;
      const str = String(text);
      lastTextRef.current = str;
      const u = new window.SpeechSynthesisUtterance(str);
      u.lang = langTag();
      utterRef.current = u;
      pausingRef.current = false;
      // onend fires on natural completion AND on cancel(); onstart/onerror keep
      // the button state honest. We ignore events from a stale utterance (a newer
      // speak() has replaced it) so quick re-taps don't flip the state wrongly.
      u.onstart = () => {
        if (utterRef.current !== u) return;
        setSpeaking(true);
        setPaused(false);
      };
      u.onend = () => {
        if (utterRef.current !== u) return;
        utterRef.current = null;
        setSpeaking(false);
        // If this end was triggered by pause() (cancel), stay "paused" so the
        // control shows Play; otherwise it finished on its own.
        setPaused(pausingRef.current);
        pausingRef.current = false;
      };
      u.onerror = () => {
        if (utterRef.current !== u) return;
        utterRef.current = null;
        setSpeaking(false);
        setPaused(false);
        pausingRef.current = false;
      };
      // Cancel anything queued so repeated taps don't stack up.
      synth.cancel();
      setSpeaking(true);
      setPaused(false);
      synth.speak(u);
    } catch {
      utterRef.current = null;
      setSpeaking(false);
      setPaused(false);
    }
  }, []);

  // Pause = reliably stop the audio and flip the control back to Play. Chrome/
  // Android's speechSynthesis.pause() often does nothing (or can't resume), so
  // rather than leave the user tapping a dead button we cancel() — which always
  // stops sound — and remember the text so resume()/Play re-reads from the start.
  const pause = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    pausingRef.current = true;
    cancelTts();
    setSpeaking(false);
    setPaused(true);
  }, [cancelTts]);

  // Resume by re-reading the last utterance from the start (see pause()).
  const resume = useCallback(() => {
    if (lastTextRef.current) speak(lastTextRef.current);
  }, [speak]);

  return {
    supported: flags.stt || flags.tts,
    sttSupported: flags.stt,
    ttsSupported: flags.tts,
    listening,
    speaking,
    paused,
    listen,
    stop,
    speak,
    pause,
    resume,
  };
}
