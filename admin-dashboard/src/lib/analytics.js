// Tiny first-party, privacy-preserving analytics client (Phase 1).
//
// First-party only: no third-party scripts, no PII. We keep an anonymous client
// `session_id` in localStorage and capture FIRST-TOUCH attribution (UTM +
// referrer host) so the backend can join anonymous top-of-funnel events to the
// signup cohort. Events are POSTed as a small batch to /api/events per the
// frozen contract.
//
// SSR safety (Next.js): every window/localStorage/document/navigator access is
// guarded and only runs from client effects (never at import time or during the
// first render). Analytics must NEVER break the page — every path swallows its
// own errors and returns a safe default.

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Only these event names are ever sent (mirrors the server allowlist).
const ALLOWED = new Set(['landing_view', 'get_app_click', 'register_start', 'register_complete']);

const SID_KEY = 'skhata_sid';
const ATTR_KEY = 'skhata_attr';

function hasWindow() {
  return typeof window !== 'undefined';
}

function readLS(key) {
  if (!hasWindow()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

function writeLS(key, value) {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch (_) {
    /* ignore (private mode / quota / disabled storage) */
  }
}

function randomId() {
  try {
    if (hasWindow() && window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
  } catch (_) {
    /* fall through to manual fallback */
  }
  // Fallback UUID-ish id (not cryptographically strong, but fine for an anon id).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Read (or lazily create) the anonymous client id. SSR-safe: returns null when
// there is no window. Capped to <=64 chars per the contract.
export function getSessionId() {
  if (!hasWindow()) return null;
  let sid = readLS(SID_KEY);
  if (!sid) {
    sid = randomId();
    writeLS(SID_KEY, sid);
  }
  if (sid && sid.length > 64) sid = sid.slice(0, 64);
  return sid;
}

// Host portion of a URL, or '' if it can't be parsed. Never returns the full
// URL (we never store query strings / paths from the referrer).
function hostOf(url) {
  if (!url) return '';
  try {
    return new URL(url).host || '';
  } catch (_) {
    return '';
  }
}

// Parse first-touch attribution from the current landing URL + referrer and
// persist it (only if not already stored). Returns the stored attribution.
// Safe to call on every landing mount — it's a no-op once first-touch is set.
export function captureAttribution() {
  if (!hasWindow()) return {};
  try {
    const existing = readLS(ATTR_KEY);
    if (existing) {
      try {
        return JSON.parse(existing) || {};
      } catch (_) {
        return {};
      }
    }
    let params;
    try {
      params = new URLSearchParams(window.location.search || '');
    } catch (_) {
      params = new URLSearchParams('');
    }
    const g = (k) => {
      const v = params.get(k);
      return v ? String(v) : '';
    };
    let referrerHost = '';
    try {
      referrerHost = hostOf(document.referrer);
      // Ignore self-referrals (internal navigation) as an acquisition source.
      if (referrerHost && referrerHost === window.location.host) referrerHost = '';
    } catch (_) {
      referrerHost = '';
    }
    const attr = {
      utm_source: g('utm_source'),
      utm_medium: g('utm_medium'),
      utm_campaign: g('utm_campaign'),
      utm_term: g('utm_term'),
      utm_content: g('utm_content'),
      referrer_host: referrerHost,
    };
    writeLS(ATTR_KEY, JSON.stringify(attr));
    return attr;
  } catch (_) {
    return {};
  }
}

// Return the stored first-touch attribution (or {}), augmented with the current
// anonymous session_id so the register POST can hand the backend everything it
// needs to attribute a signup (contract §2).
export function getAttribution() {
  if (!hasWindow()) return {};
  let attr = {};
  try {
    const raw = readLS(ATTR_KEY);
    if (raw) attr = JSON.parse(raw) || {};
  } catch (_) {
    attr = {};
  }
  const sid = getSessionId();
  return sid ? { ...attr, session_id: sid } : { ...attr };
}

// Build one contract event from the stored attribution + current path.
function buildEvent(name, props) {
  const attr = getAttribution();
  const utm = {
    source: attr.utm_source || '',
    medium: attr.utm_medium || '',
    campaign: attr.utm_campaign || '',
    term: attr.utm_term || '',
    content: attr.utm_content || '',
  };
  let path = '';
  try {
    path = window.location.pathname || '';
  } catch (_) {
    path = '';
  }
  const event = {
    name,
    ts: new Date().toISOString(),
    utm,
    referrer_host: attr.referrer_host || '',
    path,
  };
  if (props && typeof props === 'object') event.props = props;
  return event;
}

function postBatch(payload) {
  const url = `${API_BASE}/api/events`;
  const body = JSON.stringify(payload);
  // Prefer sendBeacon so the request survives page navigation/unload (e.g. the
  // "Get the app" click that navigates away). Fall back to keepalive fetch.
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon(url, blob)) return;
    }
  } catch (_) {
    /* fall through to fetch */
  }
  try {
    if (typeof fetch === 'function') {
      fetch(url, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body,
      }).catch(() => {});
    }
  } catch (_) {
    /* swallow — analytics must never break the page */
  }
}

// Track one allowlisted product event. No-op on the server / for unknown names.
// All failures are swallowed.
export function track(name, props) {
  try {
    if (!hasWindow()) return;
    if (!ALLOWED.has(name)) return;
    const sid = getSessionId();
    if (!sid) return;
    const event = buildEvent(name, props);
    postBatch({ session_id: sid, events: [event] });
  } catch (_) {
    /* swallow — analytics must never break the page */
  }
}

export default { getSessionId, captureAttribution, getAttribution, track };
