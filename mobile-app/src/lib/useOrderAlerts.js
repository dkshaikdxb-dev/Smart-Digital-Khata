import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { orders, isAuthError } from '../services/api';
import { useT } from '../i18n';
import { useNativeVoice } from './useNativeVoice';

// Repeating new-order alert, OWNER NATIVE APP (batch ORDERALERT).
//
// OTA-SAFE BY CONSTRUCTION. This file adds NO dependency: it uses only
// `AppState` and timers from react-native (both already in the shell), the
// existing axios api service, and the existing `useNativeVoice().speak()`
// (expo-speech, already installed). There is deliberately NO notification module
// here — waking a LOCKED phone is a separate, explicitly deferred follow-up that
// would need a native rebuild. What this hook gives is the in-app half: while
// the owner has the app open, an unacknowledged order keeps speaking and keeps a
// banner on screen. The WhatsApp re-send from the backend is what reaches a
// pocketed phone today.
//
// Poll cadence: every 60s while AppState is 'active'. The timer is STOPPED on
// background (no battery/data burn in a pocket) and a poll fires immediately on
// return to the foreground, so the banner is current the instant the owner
// looks. Never polls when signed out — the caller passes `enabled`.

const POLL_MS = 60_000;

// Languages expo-speech can actually speak for us today (the same map
// useNativeVoice exposes through localeSupported): bn/gu/mr are honestly NOT
// spoken. A device that cannot speak still gets the BANNER — speech is the
// bonus, never the alert itself.

export function useOrderAlerts({ enabled = true } = {}) {
  const { t, lang } = useT();
  const { speak, supported, localeSupported } = useNativeVoice(lang);

  const [items, setItems] = useState([]);
  const [settings, setSettings] = useState({
    enabled: true, repeat_minutes: 5, max_repeats: 6, muted_until: null,
  });
  const [busyId, setBusyId] = useState(null);

  const timerRef = useRef(null);
  // orderId -> { at: ms of the last spoken line, count: how many have been said }
  const spokenRef = useRef(new Map());
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const r = await orders.alerts(lang);
      if (!aliveRef.current) return;
      setItems(Array.isArray(r.items) ? r.items : []);
      if (r.alert) setSettings(r.alert);
    } catch (e) {
      // A poll failure must never pop an alert over whatever screen the owner is
      // on. A handled 401 already routed to Login; anything else simply retries
      // on the next tick. Clear the list so a stale banner is never shown from
      // data we can no longer confirm.
      if (!aliveRef.current) return;
      if (!isAuthError(e)) setItems([]);
      else setItems([]);
    }
  }, [enabled, lang]);

  // Poll while the app is in the FOREGROUND; stop on background; poll at once on
  // return. One effect owns the timer so it can never be double-registered.
  useEffect(() => {
    aliveRef.current = true;
    const stop = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
    const start = () => {
      stop();
      if (!enabled) return;
      load();
      timerRef.current = setInterval(load, POLL_MS);
    };

    if (!enabled) {
      // Signed out: no timer, no state, no stale banner from the last session.
      stop();
      setItems([]);
      spokenRef.current.clear();
      return () => { aliveRef.current = false; stop(); };
    }

    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else stop();
    });

    return () => {
      aliveRef.current = false;
      stop();
      try { if (sub && typeof sub.remove === 'function') sub.remove(); } catch (e) { /* ignore */ }
    };
  }, [enabled, load]);

  const oldest = items.length ? items[0] : null;

  // Muted right now? Derived from the stored timestamp on every render, so the
  // banner goes quiet the moment a mute is set and speaks again when it lapses.
  const muted = useMemo(() => {
    if (!settings || !settings.muted_until) return false;
    const until = new Date(settings.muted_until).getTime();
    return Number.isFinite(until) && until > Date.now();
  }, [settings]);

  // Whether this device can honestly speak the owner's language. False → silent,
  // never English audio for Hindi text, and never a fake "spoken" promise. The
  // BANNER is unaffected.
  const canSpeak = !!supported && !!localeSupported(lang);

  // The spoken line, on the SHOP's repeat cadence (not once per poll) and capped
  // at max_repeats. Tracked per order id so a second order starts its own count.
  useEffect(() => {
    if (!enabled || !oldest) return;
    if (muted || settings.enabled === false) return;
    if (!canSpeak) return;

    const repeatMs = Math.max(1, Number(settings.repeat_minutes) || 5) * 60_000;
    const cap = Math.max(0, Number(settings.max_repeats) || 0);
    const seen = spokenRef.current.get(oldest.id) || { at: 0, count: 0 };
    if (seen.count >= cap) return;                 // quiet, but still on screen
    if (Date.now() - seen.at < repeatMs) return;   // not due yet

    const name = oldest.customer_name_local || oldest.customer_name || '';
    speak(
      t('oalert.spoken', {
        name,
        n: Number(oldest.item_count) || 0,
        amount: (Number(oldest.total || 0) / 100).toFixed(0),
      }),
      lang
    );
    spokenRef.current.set(oldest.id, { at: Date.now(), count: seen.count + 1 });
  }, [enabled, oldest, muted, settings, canSpeak, speak, t, lang]);

  // Drop cadence state for orders that are no longer waiting, so a long-running
  // session cannot grow the map without bound.
  useEffect(() => {
    const live = new Set(items.map((i) => i.id));
    Array.from(spokenRef.current.keys()).forEach((id) => {
      if (!live.has(id)) spokenRef.current.delete(id);
    });
  }, [items]);

  // "Seen" — optimistic removal so the banner disappears instantly on a tap even
  // on a slow link; the next poll is the source of truth either way.
  const ack = useCallback(async (id) => {
    setBusyId(id);
    try {
      await orders.ack(id);
      setItems((list) => list.filter((i) => i.id !== id));
    } catch (e) { /* the next poll re-syncs */ }
    finally { setBusyId(null); }
  }, []);

  const mute = useCallback(async (minutes) => {
    try {
      const r = await orders.mute(minutes);
      setSettings((s) => ({ ...s, muted_until: r.muted_until }));
    } catch (e) { /* the next poll re-syncs */ }
  }, []);

  return {
    items,
    oldest,
    settings,
    muted,
    canSpeak,
    busyId,
    ack,
    mute,
    refresh: load,
  };
}

export default useOrderAlerts;
