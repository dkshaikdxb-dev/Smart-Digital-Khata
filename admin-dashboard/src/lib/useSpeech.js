import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getLang } from './i18n';
import voiceProvider from './voiceProvider';

// Voice input/output for the rural audience, built on ONLY the browser Web Speech
// API — no libraries. Speech-to-text uses SpeechRecognition (webkit-prefixed on
// Chrome/Android WebView); text-to-speech uses speechSynthesis. Every call is
// wrapped in try/catch and no-ops when its API is missing, so a page never breaks
// on a device without support. Callers hide their voice buttons using the
// `sttSupported` / `ttsSupported` flags (or `supported` for "either").
//
// LOCAL-FIRST. A cloud provider SEAM (voiceProvider) exists as an honest fallback
// for devices that genuinely cannot serve speech locally, but it is DISABLED by
// default and returns null with no network — so out of the box this hook behaves
// exactly as the pure Web-Speech implementation always has.

// Map the current UI language to a BCP-47 tag for both recognition + synthesis.
const BCP47 = {
  en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN', te: 'te-IN', kn: 'kn-IN', ml: 'ml-IN', ur: 'ur-IN',
};

function langTag() {
  return BCP47[getLang()] || 'en-IN';
}

// The two-letter primary subtag, lower-cased (e.g. 'hi-IN' → 'hi'). Used to match
// a synthesis voice to the current language by prefix.
function primarySubtag(tag) {
  return String(tag || '').slice(0, 2).toLowerCase();
}

// Inspect the installed synthesis voices for the given BCP-47 tag. `loaded` says
// whether getVoices() returned anything at all (it is often empty on first call,
// before the async 'voiceschanged' event), and `voice` is the first voice whose
// language shares the primary subtag, or null. Keeping `loaded` distinct lets
// speak() stay conservative: it only suppresses audio when voices ARE loaded and
// none match — never while the list is merely not ready yet.
function inspectVoices(tag) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return { loaded: false, voice: null };
  try {
    const voices = window.speechSynthesis.getVoices() || [];
    const prefix = primarySubtag(tag);
    const voice = prefix ? voices.find((v) => primarySubtag(v.lang) === prefix) || null : null;
    return { loaded: voices.length > 0, voice };
  } catch {
    return { loaded: false, voice: null };
  }
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
  // Richer recognition result surface, all backward-compatible additions:
  //  - lastConfidence: the top alternative's confidence (0..1), or null when the
  //    engine did not report one (many Androids send 0/undefined — "unknown",
  //    never "poor").
  //  - lastAlternatives: [{ transcript, confidence }] for results[0], best-first.
  //  - lowConfidence: true only when a confidence was reported AND it is < 0.5.
  //  - lastStatus: 'ok' | 'poor' | 'empty' | 'error' — lets a caller reason about
  //    whether recognition actually served.
  const [lastConfidence, setLastConfidence] = useState(null);
  const [lastAlternatives, setLastAlternatives] = useState([]);
  const [lowConfidence, setLowConfidence] = useState(false);
  const [lastStatus, setLastStatus] = useState(null);
  // Whether a real LOCAL synthesis voice exists for the current language. Drives
  // honest read-aloud gating so a language with no voice never offers a button
  // that would speak the wrong language.
  const [ttsVoiceAvailable, setTtsVoiceAvailable] = useState(false);
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

  // Recompute ttsVoiceAvailable for the current language whenever the installed
  // voices change (async on first load) or the UI language changes (same-tab
  // custom event + cross-tab storage event, matching i18n's dispatch).
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return undefined;
    const recompute = () => setTtsVoiceAvailable(!!inspectVoices(langTag()).voice);
    recompute();
    const synth = window.speechSynthesis;
    if (synth.addEventListener) synth.addEventListener('voiceschanged', recompute);
    window.addEventListener('skhata-lang', recompute); // i18n setLang() dispatch
    window.addEventListener('storage', recompute);
    return () => {
      if (synth.removeEventListener) synth.removeEventListener('voiceschanged', recompute);
      window.removeEventListener('skhata-lang', recompute);
      window.removeEventListener('storage', recompute);
    };
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

  // Cloud ASR fallback. LOCAL-FIRST: only reached when local recognition was
  // unavailable, errored, or low-confidence, AND the provider seam is explicitly
  // enabled. Disabled by default → this returns immediately with no network, so
  // behaviour matches the pure Web-Speech path. On success it delivers via the
  // richer callback shape (transcript + { confidence, alternatives }).
  const attemptCloudAsr = useCallback((onResult) => {
    if (!voiceProvider.asrEnabled()) return; // default: no cloud traffic, ever
    // TODO(seam): capture microphone audio (MediaRecorder) to pass as `blob`. That
    // recorder path is intentionally unbuilt while the provider flag is off — it
    // cannot be exercised — so we pass no blob and the disabled provider no-ops.
    Promise.resolve()
      .then(() => voiceProvider.transcribe({ blob: null, lang: langTag() }))
      .then((res) => {
        if (res && res.transcript && typeof onResult === 'function') {
          const confidence = res.confidence != null ? res.confidence : null;
          const alternatives = Array.isArray(res.alternatives) ? res.alternatives : [];
          setLastConfidence(confidence);
          setLastAlternatives(alternatives);
          setLowConfidence(confidence != null && confidence < 0.5);
          setLastStatus('ok');
          onResult(String(res.transcript).trim(), { confidence, alternatives });
        }
      })
      .catch(() => {
        /* seam failure: local result (or none) already stands */
      });
  }, []);

  // Start recognition. `onResult` stays BACKWARD-COMPATIBLE: existing single-arg
  // callers still receive just the best transcript (trimmed). Newer callers may
  // read the optional second arg `{ confidence, alternatives }`.
  const listen = useCallback((onResult) => {
    if (typeof window === 'undefined') return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      // Local STT unavailable on this device. Offer the (disabled-by-default) seam.
      setLastStatus('error');
      attemptCloudAsr(onResult);
      return;
    }
    try {
      const rec = new SR();
      recRef.current = rec;
      rec.lang = langTag();
      rec.interimResults = false;
      rec.maxAlternatives = 3;
      rec.continuous = false;
      rec.onresult = (e) => {
        try {
          const r0 = e.results && e.results[0];
          // Collect every alternative of results[0], best-first, as
          // { transcript, confidence }.
          const alternatives = [];
          if (r0) {
            for (let i = 0; i < r0.length; i += 1) {
              const alt = r0[i];
              if (alt) {
                const c = typeof alt.confidence === 'number' && alt.confidence > 0 ? alt.confidence : null;
                alternatives.push({ transcript: (alt.transcript || '').trim(), confidence: c });
              }
            }
          }
          const best = r0 && r0[0] && r0[0].transcript ? r0[0].transcript.trim() : '';
          // Chrome supplies confidence on FINAL results; many Androids report
          // 0/undefined — treat a missing/zero value as "unknown", never "poor".
          const rawConf = r0 && r0[0] ? r0[0].confidence : undefined;
          const confidence = typeof rawConf === 'number' && rawConf > 0 ? rawConf : null;
          const poor = confidence != null && confidence < 0.5;
          setLastConfidence(confidence);
          setLastAlternatives(alternatives);
          setLowConfidence(poor);
          setLastStatus(best ? (poor ? 'poor' : 'ok') : 'empty');
          if (best && typeof onResult === 'function') {
            // Single-arg callers ignore the extra arg; it is safe to always pass.
            onResult(best, { confidence, alternatives });
          }
          // LOCAL-FIRST fallback: only when local truly couldn't serve — an empty
          // transcript OR a low-confidence one — reach for the disabled-by-default
          // cloud seam. It no-ops unless explicitly enabled.
          if (!best || poor) attemptCloudAsr(onResult);
        } catch {
          /* ignore a malformed result */
        }
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => {
        setListening(false);
        setLastStatus('error');
        // Local recognition errored — offer the disabled-by-default seam (no-op).
        attemptCloudAsr(onResult);
      };
      setListening(true);
      rec.start();
    } catch {
      // Some browsers throw if start() is called twice or permission is denied.
      setListening(false);
    }
  }, [attemptCloudAsr]);

  const speak = useCallback((text) => {
    if (typeof window === 'undefined' || !window.speechSynthesis || !text) return;
    const tag = langTag();
    const { loaded, voice } = inspectVoices(tag);
    // Honest TTS: never emit wrong-language audio. If the voice list is LOADED and
    // contains no voice for this language, do not speak locally — fall back to the
    // (disabled-by-default) cloud seam, or stay silent. When the list is not yet
    // loaded (unknown), keep today's behaviour and let the engine choose.
    if (loaded && !voice) {
      if (voiceProvider.ttsEnabled()) {
        Promise.resolve()
          .then(() => voiceProvider.synthesize({ text: String(text), lang: tag }))
          .catch(() => {});
      }
      return;
    }
    try {
      const synth = window.speechSynthesis;
      const str = String(text);
      lastTextRef.current = str;
      const u = new window.SpeechSynthesisUtterance(str);
      u.lang = tag;
      // Pin the matching local voice when we found one, so the engine does not fall
      // back to a wrong-language default.
      if (voice) u.voice = voice;
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
    ttsVoiceAvailable,
    listening,
    speaking,
    paused,
    lastConfidence,
    lastAlternatives,
    lowConfidence,
    lastStatus,
    listen,
    stop,
    speak,
    pause,
    resume,
  };
}
