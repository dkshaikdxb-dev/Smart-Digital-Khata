import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { apiFetch } from '../lib/api';
import { useLang } from '../lib/i18n';

// Repeating new-order alert, OWNER WEB CONSOLE (batch ORDERALERT). This is the
// channel that ships on the next deploy with no app rebuild at all.
//
// It polls GET /api/orders/alerts and, while any order is unacknowledged, keeps a
// sticky high-contrast banner at the top of every owner page with the oldest
// order's facts and two big buttons: "Seen" (POST ack) and "Open" (go to the
// order). Every `repeat_minutes` it also plays a short chime and speaks one short
// localized line, up to `max_repeats` times per order — then the banner STAYS but
// goes quiet, so the owner is never nagged forever without a visible reason.
//
// NO new dependency: the chime is two short Web Audio oscillator beeps (no audio
// asset, no library) and the voice is the browser's built-in speechSynthesis.
//
// Mounted from Nav, which already renders nothing when the page is embedded in
// the native app's WebView (?embed=1) — the app draws its own banner there.

// Poll cadence while the tab is visible. Deliberately slower than the alert
// cadence: the repeat decision is made locally from `age`/`alert_count`, so a
// 60s poll is only about picking up NEW orders and acks made elsewhere.
const POLL_MS = 60_000;

// Language → BCP-47 for speech synthesis, matching lib/useSpeech.
const BCP47 = {
  en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN', te: 'te-IN', kn: 'kn-IN', ml: 'ml-IN', ur: 'ur-IN',
};

function rupeesLabel(paise) {
  return `₹${(Number(paise || 0) / 100).toFixed(2)}`;
}

/**
 * Two short descending beeps through one AudioContext. THROWS when the browser
 * has not yet seen a user gesture (autoplay policy) — the caller turns that into
 * the honest "Turn on sound" button rather than a silent failure or a log loop.
 */
function playChime(ctx) {
  const now = ctx.currentTime;
  [[880, 0], [660, 0.22]].forEach(([freq, at]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    // Short attack/decay envelope so it reads as a "ding", not a buzz, and never
    // clips. Peak is modest — this fires in a shop, not a concert hall.
    gain.gain.setValueAtTime(0.0001, now + at);
    gain.gain.exponentialRampToValueAtTime(0.28, now + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + at);
    osc.stop(now + at + 0.22);
  });
}

/**
 * Speak one short line in `lang`. HONEST: if the voice list has loaded and holds
 * no voice for this language we stay SILENT rather than reading Hindi text with
 * an English voice (the same rule lib/useSpeech follows). Never throws.
 */
function speakLine(text, lang) {
  if (typeof window === 'undefined' || !window.speechSynthesis || !text) return;
  const tag = BCP47[lang] || 'en-IN';
  try {
    const voices = window.speechSynthesis.getVoices() || [];
    const prefix = tag.slice(0, 2).toLowerCase();
    const voice = voices.find((v) => String(v.lang || '').slice(0, 2).toLowerCase() === prefix) || null;
    if (voices.length > 0 && !voice) return; // loaded, no match → stay silent
    const u = new window.SpeechSynthesisUtterance(String(text));
    u.lang = tag;
    if (voice) u.voice = voice;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch (e) { /* speech is best-effort; never break the banner */ }
}

export default function OrderAlert() {
  const router = useRouter();
  const { t, lang } = useLang();
  const [items, setItems] = useState([]);
  const [settings, setSettings] = useState({ enabled: true, repeat_minutes: 5, max_repeats: 6, muted_until: null });
  // 'ok' | 'blocked' — 'blocked' means the browser refused audio before a user
  // gesture, so we offer a one-tap "Turn on sound" instead of retrying forever.
  const [audio, setAudio] = useState('ok');
  const [busyId, setBusyId] = useState(null);

  const ctxRef = useRef(null);
  // The banner element, measured so the page can be pushed clear of it.
  const bannerRef = useRef(null);
  const timerRef = useRef(null);
  // orderId -> { at: epoch ms of the last chime/speak, count: how many fired }.
  const spokenRef = useRef(new Map());

  const load = useCallback(async () => {
    try {
      const q = lang && lang !== 'en' ? `?lang=${encodeURIComponent(lang)}` : '';
      const r = await apiFetch(`/api/orders/alerts${q}`);
      setItems(Array.isArray(r.items) ? r.items : []);
      if (r.alert) setSettings(r.alert);
    } catch (e) {
      // A poll failure (offline, 401 on a stale tab, a 5xx) must never surface as
      // an error box on every owner page — the next poll simply tries again.
      setItems([]);
    }
  }, [lang]);

  // Poll while the tab is VISIBLE; stop the timer when it is hidden and poll
  // immediately on becoming visible again, so a phone that was in a pocket shows
  // a current banner the moment the owner looks at it.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let alive = true;

    const stop = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
    const start = () => {
      stop();
      if (!alive) return;
      load();
      timerRef.current = setInterval(() => { if (alive) load(); }, POLL_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { alive = false; stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [load]);

  const oldest = items.length ? items[0] : null;

  // Is the shop muted right now? Recomputed on every render from the stored
  // timestamp, so the banner goes quiet the moment a mute is set and speaks
  // again the moment it lapses.
  const muted = useMemo(() => {
    if (!settings || !settings.muted_until) return false;
    const until = new Date(settings.muted_until).getTime();
    return Number.isFinite(until) && until > Date.now();
  }, [settings]);

  // The chime + the spoken line, gated on the per-order cadence and cap. The
  // banner itself is NEVER gated on this — a silent device still sees it.
  useEffect(() => {
    if (!oldest) return;
    if (muted || settings.enabled === false) return;
    if (audio === 'blocked') return;

    const repeatMs = Math.max(1, Number(settings.repeat_minutes) || 5) * 60_000;
    const cap = Math.max(0, Number(settings.max_repeats) || 0);
    const seen = spokenRef.current.get(oldest.id) || { at: 0, count: 0 };
    if (seen.count >= cap) return;                 // quiet, but still on screen
    if (Date.now() - seen.at < repeatMs) return;   // not due yet

    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) throw new Error('no audio');
      if (!ctxRef.current) ctxRef.current = new Ctx();
      const ctx = ctxRef.current;
      // A context created before a gesture starts 'suspended'; resume() rejects
      // in that case, which is exactly the autoplay block we surface honestly.
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => setAudio('blocked'));
        if (ctx.state === 'suspended') { setAudio('blocked'); return; }
      }
      playChime(ctx);
    } catch (e) {
      setAudio('blocked');
      return;
    }

    const name = oldest.customer_name_local || oldest.customer_name || '';
    speakLine(
      t('oalert.spoken', {
        name,
        n: Number(oldest.item_count) || 0,
        amount: (Number(oldest.total || 0) / 100).toFixed(0),
      }),
      lang
    );
    spokenRef.current.set(oldest.id, { at: Date.now(), count: seen.count + 1 });
  }, [oldest, muted, settings, audio, t, lang]);

  // Forget the per-order cadence state for orders that are no longer waiting, so
  // the map cannot grow without bound on a long-lived tab.
  useEffect(() => {
    const live = new Set(items.map((i) => i.id));
    for (const id of Array.from(spokenRef.current.keys())) {
      if (!live.has(id)) spokenRef.current.delete(id);
    }
  }, [items]);

  // KEEP THE PAGE CLEAR OF THE BANNER.
  //
  // The banner is position:fixed at the very top so it cannot be scrolled away
  // from — that is the point of an alarm. But fixed elements are out of normal
  // flow, so without this the banner sits ON TOP of the app bar and the owner
  // loses their navigation for as long as an order is unacknowledged. On a phone
  // the bottom tab bar hides the damage; on a desktop there is no bottom bar and
  // the header is simply gone.
  //
  // So reserve exactly the banner's height as padding on <body>. It is measured
  // rather than hardcoded because the banner wraps to two or three rows
  // depending on width and language, and re-measured on resize. The padding is
  // removed when the banner goes away (acknowledged, muted, or unmounted), so a
  // quiet console is pixel-identical to before this feature existed.
  useEffect(() => {
    const el = bannerRef.current;
    if (!el) return undefined;
    const apply = () => {
      const h = el.getBoundingClientRect().height;
      document.body.style.paddingTop = h ? `${Math.ceil(h)}px` : '';
    };
    apply();
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(apply);
      ro.observe(el);
    }
    window.addEventListener('resize', apply);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', apply);
      document.body.style.paddingTop = '';
    };
  }, [oldest && oldest.id, audio, muted]);

  // The one-tap escape from the browser's autoplay block: a real user gesture, so
  // creating/resuming the context here is always allowed.
  async function enableSound() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!ctxRef.current) ctxRef.current = new Ctx();
      await ctxRef.current.resume();
      playChime(ctxRef.current);
      setAudio('ok');
    } catch (e) { /* still blocked — the button simply stays */ }
  }

  async function ack(id) {
    setBusyId(id);
    try {
      await apiFetch(`/api/orders/${id}/ack`, { method: 'POST', body: JSON.stringify({}) });
      setItems((list) => list.filter((i) => i.id !== id));
    } catch (e) { /* the next poll re-syncs */ }
    finally { setBusyId(null); }
  }

  async function mute(minutes) {
    try {
      const r = await apiFetch('/api/orders/alerts/mute', {
        method: 'POST',
        body: JSON.stringify({ minutes }),
      });
      setSettings((s) => ({ ...s, muted_until: r.muted_until }));
    } catch (e) { /* the next poll re-syncs */ }
  }

  if (!oldest) return null;

  const waited = t('oalert.waiting', { mins: Math.max(0, Math.round(Number(oldest.age_seconds || 0) / 60)) });
  const name = oldest.customer_name_local || oldest.customer_name || '';

  return (
    <div className="oalert" ref={bannerRef} role="alert" aria-live="assertive">
      <div className="oalert-main">
        <div className="oalert-title">
          {t('oalert.title')}
          {items.length > 1 && <span className="oalert-more">{t('oalert.more', { n: items.length - 1 })}</span>}
        </div>
        <div className="oalert-facts">
          <b>{name}</b>
          <span>{t('oalert.items', { n: Number(oldest.item_count) || 0 })}</span>
          <span>{rupeesLabel(oldest.total)}</span>
          <span>{waited}</span>
        </div>
      </div>
      <div className="oalert-actions">
        <button
          type="button"
          className="oalert-btn oalert-seen"
          disabled={busyId === oldest.id}
          onClick={() => ack(oldest.id)}
        >
          {t('oalert.seen')}
        </button>
        <button
          type="button"
          className="oalert-btn oalert-open"
          onClick={() => router.push(`/orders/${oldest.id}`)}
        >
          {t('oalert.open')}
        </button>
      </div>
      <div className="oalert-minor">
        {audio === 'blocked' && (
          <button type="button" className="oalert-link" onClick={enableSound}>{t('oalert.enableSound')}</button>
        )}
        {muted
          ? <button type="button" className="oalert-link" onClick={() => mute(0)}>{t('oalert.unmute')}</button>
          : <button type="button" className="oalert-link" onClick={() => mute(30)}>{t('oalert.mute30')}</button>}
        <Link href="/settings#order-alerts" className="oalert-link">{t('oalert.settings')}</Link>
      </div>
    </div>
  );
}
