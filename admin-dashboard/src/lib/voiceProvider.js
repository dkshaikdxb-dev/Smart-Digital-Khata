// Cloud voice provider SEAM — DISABLED BY DEFAULT.
//
// This module is a documented integration point, NOT a live client. It exists so
// the local Web-Speech path (see useSpeech.js) has a single, honest place to fall
// back to WHEN — and only when — a device genuinely cannot serve speech locally.
//
// With the flag off (the default), `asrEnabled()` / `ttsEnabled()` return false and
// `transcribe()` / `synthesize()` return `null` IMMEDIATELY, with NO network call,
// NO audio leaving the device, and NO credentials anywhere in this file. In that
// state behaviour is exactly today's pure Web-Speech behaviour.
//
// Enabling the flag is deliberately NOT enough to reach a third party: the intended
// enabled path is a POST to a FIRST-PARTY backend proxy (see the TODOs below) that
// would hold any keys and talk to the upstream speech service server-side. The
// browser never contacts the upstream service directly, and this repo ships no such
// call — the seam is intentionally inert until a backend endpoint exists to serve it.

// Read the public build-time flag. Off unless explicitly set to '1'. Wrapped in
// try/catch because `process` may be undefined in some execution contexts.
function bhashiniEnabled() {
  try {
    return typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_BHASHINI === '1';
  } catch {
    return false;
  }
}

// Whether the cloud ASR (speech-to-text) fallback is available. Default false.
export function asrEnabled() {
  return bhashiniEnabled();
}

// Whether the cloud TTS (text-to-speech) fallback is available. Default false.
export function ttsEnabled() {
  return bhashiniEnabled();
}

// Attempt a cloud transcription. Returns `{ transcript, confidence, alternatives }`
// when it succeeds, or `null`. When disabled (the default) it returns null with no
// network access, so callers simply keep whatever the local engine produced.
//
// eslint-disable-next-line no-unused-vars
export async function transcribe({ blob, lang } = {}) {
  if (!asrEnabled()) return null; // disabled: no network; caller keeps local result
  // TODO(seam): POST { audio: blob, lang } to a first-party backend proxy that
  // forwards to the upstream ASR service and returns { transcript, confidence }.
  // The audio-capture path (MediaRecorder) is intentionally NOT built while the flag
  // is off — it cannot be exercised — and must be wired up together with the proxy.
  return null;
}

// Attempt a cloud synthesis. Returns a playable result (e.g. an audio blob/URL) when
// it succeeds, or `null`. When disabled (the default) it returns null with no network
// access, so callers fall back to silence rather than wrong-language audio.
//
// eslint-disable-next-line no-unused-vars
export async function synthesize({ text, lang } = {}) {
  if (!ttsEnabled()) return null; // disabled: no network; caller keeps local voice
  // TODO(seam): POST { text, lang } to a first-party backend proxy that returns
  // synthesized audio to play. Not built while the flag is off.
  return null;
}

export default { asrEnabled, ttsEnabled, transcribe, synthesize };
