import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLang } from '../lib/i18n';
import { getCustomerToken, customerFetch, publicFetch } from '../lib/customerApi';
import { placeAnchoredSheet, UNMEASURED_PLACEMENT } from './anchoredSheet';

// The single source of truth the client will later send to the promos API. It
// lives in localStorage so it is available whether or not the shopper is logged
// in; when they ARE logged in it is also mirrored to their customer_users row
// (via /api/my/location) as a cross-device backup.
const LOC_KEY = 'skhata-loc';

const EMPTY = { town: '', village: '', pincode: '' };

// Read the saved location from localStorage. SSR-guarded and defensive: a
// blocked store, absent value, or malformed JSON all resolve to null so the
// first client paint stays stable (empty-state chip).
function readStoredLoc() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LOC_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object') return null;
    return {
      town: typeof v.town === 'string' ? v.town : '',
      village: typeof v.village === 'string' ? v.village : '',
      pincode: typeof v.pincode === 'string' ? v.pincode : '',
    };
  } catch (e) {
    return null;
  }
}

function writeStoredLoc(loc) {
  try {
    window.localStorage.setItem(LOC_KEY, JSON.stringify(loc));
  } catch (e) {
    /* storage blocked — the in-memory choice still applies for this session */
  }
  // Nudge any interested component (e.g. the promo slider) to re-read the saved
  // location and re-fetch, so a location change takes effect without a reload.
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('skhata:location-changed', { detail: loc }));
    }
  } catch (e) {
    /* CustomEvent unsupported — the value is still persisted for the next load */
  }
}

// useLayoutEffect measures and repositions the sheet BEFORE the browser paints,
// so the sheet is never seen in the unmeasured fallback position. React warns
// when it is called during a server render (where it does nothing), and this
// component is server-rendered as part of the topbar, so fall back to useEffect
// there. The sheet only exists once a shopper has opened it, which is always
// client-side, so the server branch never actually places anything.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function hasAny(loc) {
  return !!(loc && ((loc.town || '').trim() || (loc.village || '').trim() || (loc.pincode || '').trim()));
}

// A location pin glyph drawn from tokens (currentColor), so it matches the
// topbar text in every theme and needs no image asset.
function PinIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-6-5.686-6-10a6 6 0 1 1 12 0c0 4.314-6 10-6 10z" />
      <circle cx="12" cy="11" r="2.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Consumer location control for the PWA topbar (batch LOC1). A chip trigger
// shows the chosen town (or an empty-state label); it opens a small popover with
// Town / Village / Pincode fields, a Detect button (GPS → nearest listed shop),
// and Save / Cancel. Mirrors CpwaThemeToggle's popover mechanics: a stable SSR
// first paint (empty chip, closed), then a mount effect reads the effective
// location; Escape / outside-click close and restore focus to the trigger.
//
// Where the sheet is drawn is NOT left to CSS. It is placed from the trigger's
// measured rect and clamped inside the viewport, and below the phone breakpoint
// it stops being a popover and spans the width of the screen. The arithmetic and
// the reasoning live in components/anchoredSheet.js. This matters more than it
// sounds: this is how a shopper tells the storefront where they are, and the
// field labels are the only thing saying which box is the town and which the
// pincode, so a sheet half off the screen is a control nobody can use.
export default function CpwaLocationPicker() {
  const { t } = useLang();
  const [mounted, setMounted] = useState(false);
  const [saved, setSaved] = useState(EMPTY); // the persisted location (chip source)
  const [form, setForm] = useState(EMPTY); // the in-sheet draft
  const [open, setOpen] = useState(false);
  const [detecting, setDetecting] = useState(false);
  // Viewport coordinates for the open sheet, recomputed from the live trigger
  // rect. null until the first measurement lands (see the layout effect below).
  const [placement, setPlacement] = useState(null);
  const suggestedRef = useRef(false); // GPS suggestion attempted this session
  const btnRef = useRef(null);
  const sheetRef = useRef(null);
  const firstFieldRef = useRef(null);

  // On mount, resolve the effective location. localStorage wins for immediacy;
  // when nothing is stored and the shopper is logged in, hydrate from the
  // profile (the cross-device backup) and cache it locally.
  useEffect(() => {
    let cancelled = false;
    setMounted(true);
    const stored = readStoredLoc();
    if (stored) {
      setSaved(stored);
      return undefined;
    }
    if (getCustomerToken()) {
      customerFetch('/api/my/location')
        .then((loc) => {
          if (cancelled || !loc) return;
          const next = {
            town: loc.town || '',
            village: loc.village || '',
            pincode: loc.pincode || '',
          };
          if (hasAny(next)) {
            setSaved(next);
            writeStoredLoc(next);
          }
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, []);

  // Non-blocking first-run DEFAULT: geolocate, ask the public directory for the
  // nearest listed shop, and PREFILL the draft from its town/village/pincode as
  // a suggestion the shopper confirms. Never auto-saves; denial/timeout/failure
  // just leaves the draft as-is. Also wired to the explicit Detect button.
  const detect = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    setDetecting(true);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setDetecting(false);
    };
    try {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const { latitude, longitude } = pos.coords;
            const data = await publicFetch(`/api/public/shops?lat=${latitude}&lng=${longitude}`);
            const nearest = data && Array.isArray(data.shops) ? data.shops[0] : null;
            if (nearest) {
              setForm((prev) => ({
                town: nearest.city || prev.town,
                village: nearest.village || prev.village,
                pincode: nearest.pincode || prev.pincode,
              }));
            }
          } catch (e) {
            /* nearest-shop lookup failed — leave the draft untouched */
          } finally {
            finish();
          }
        },
        () => finish(), // denied / unavailable — non-blocking
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
      );
    } catch (e) {
      finish();
    }
  }, []);

  const openSheet = useCallback(() => {
    const start = hasAny(saved) ? saved : EMPTY;
    setForm(start);
    setOpen(true);
    // First-run suggestion: only when there is nothing saved yet, once per session.
    if (!hasAny(saved) && !suggestedRef.current) {
      suggestedRef.current = true;
      detect();
    }
  }, [saved, detect]);

  const closeSheet = useCallback((refocus) => {
    setOpen(false);
    if (refocus && btnRef.current) btnRef.current.focus();
  }, []);

  const save = useCallback(() => {
    const next = {
      town: (form.town || '').trim(),
      village: (form.village || '').trim(),
      pincode: (form.pincode || '').trim(),
    };
    writeStoredLoc(next);
    setSaved(next);
    // Cross-device backup for logged-in shoppers; never blocks the local save.
    if (getCustomerToken()) {
      customerFetch('/api/my/location', {
        method: 'PUT',
        body: JSON.stringify(next),
      }).catch(() => {});
    }
    closeSheet(true);
  }, [form, closeSheet]);

  // Keep the open sheet inside the viewport. The placement is derived from the
  // trigger's LIVE rect rather than from CSS, because the only way to guarantee
  // both edges are on-screen is to measure where the trigger actually is and
  // clamp against the actual viewport — see components/anchoredSheet.js for why
  // the pure-CSS end-anchor put the sheet off the left edge on a phone.
  //
  // Re-measured on resize (rotation, a desktop window drag across the phone
  // breakpoint) and on scroll in the capture phase, so an ancestor scrolling the
  // sticky topbar out from under the sheet moves the sheet with it.
  useIsomorphicLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return undefined;
    }
    const reposition = () => {
      const anchor = btnRef.current;
      setPlacement(placeAnchoredSheet({
        anchorRect: anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }));
    };
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  // Focus the first field when the sheet opens.
  useEffect(() => {
    if (open && firstFieldRef.current) firstFieldRef.current.focus();
  }, [open]);

  // Close on outside click / tap.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (sheetRef.current && sheetRef.current.contains(e.target)) return;
      if (btnRef.current && btnRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  const onSheetKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSheet(true);
    }
  };

  const onTriggerKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      openSheet();
    }
  };

  // Pincode accepts digits only, capped at 6 (validated 4–6 on the server).
  const onPincode = (e) => {
    const digits = (e.target.value || '').replace(/[^0-9]/g, '').slice(0, 6);
    setForm((prev) => ({ ...prev, pincode: digits }));
  };

  // Stable SSR / first-paint label: the empty-state text until the mount effect
  // has read the effective location, then the saved town (or empty-state).
  const chipLabel = mounted && saved.town ? saved.town : t('c.loc.set');

  return (
    <div className="cpwa-loc-picker">
      <button
        ref={btnRef}
        type="button"
        className="secondary cpwa-loc-chip"
        // WHY THE LABEL TRUNCATED. Two causes, neither of them a pixel value.
        //
        // First, .cpwa-loc-chip caps the chip at max-width: 116px. 116 is not a
        // measurement of anything: the pin glyph (15) + gap (6) + the chip's own
        // padding and border (22) leave about 73px for the text, and "Set
        // location" at 13px/600 needs 74. It has been one pixel too narrow to say
        // what it is for. Raising the number would only move the problem to the
        // next language — the Urdu label is wider again — so the cap goes, and
        // `max-width: 100%` takes its place: the chip may be as wide as its text
        // needs, but never wider than the box it sits in.
        //
        // Second, that box (.cpwa-loc-picker, `flex: 0 1 auto; min-width: 0`) is
        // the ONLY shrinkable item in the topbar's tools row, so every pixel the
        // row is short is taken out of this one control. The capped chip did not
        // shrink with it, it OVERFLOWED it, and the theme toggle was painted on
        // top of the end of the word. Bounding the chip to its wrapper turns that
        // silent overlap into an honest ellipsis — and CustomerShell now lets the
        // tools row WRAP, so on a phone the row is not short in the first place
        // and the label is shown in full. A saved town name long enough to still
        // not fit degrades to an ellipsis, which is the right answer for a value
        // that has no upper bound.
        style={{ maxWidth: '100%' }}
        onClick={() => (open ? closeSheet(false) : openSheet())}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('c.loc.title')}
        title={t('c.loc.chip')}
      >
        <PinIcon />
        <span className="cpwa-loc-chip-label">{chipLabel}</span>
      </button>
      {open && (
        <div
          ref={sheetRef}
          className="cpwa-loc-sheet"
          // Measured placement, or the plainly-on-screen fallback for the single
          // frame before the layout effect has run. Inline styles win over the
          // stylesheet's absolute/end-anchored rule outright, which is the point:
          // there is one place that decides where this sheet goes, and it is the
          // one that can see the viewport.
          style={placement || UNMEASURED_PLACEMENT}
          role="dialog"
          aria-label={t('c.loc.title')}
          onKeyDown={onSheetKeyDown}
        >
          <div className="cpwa-loc-sheet-title">{t('c.loc.title')}</div>
          <label className="cpwa-loc-field">
            <span>{t('c.loc.town')}</span>
            <input
              ref={firstFieldRef}
              type="text"
              value={form.town}
              onChange={(e) => setForm((prev) => ({ ...prev, town: e.target.value }))}
            />
          </label>
          <label className="cpwa-loc-field">
            <span>{t('c.loc.village')}</span>
            <input
              type="text"
              value={form.village}
              onChange={(e) => setForm((prev) => ({ ...prev, village: e.target.value }))}
            />
          </label>
          <label className="cpwa-loc-field">
            <span>{t('c.loc.pincode')}</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={form.pincode}
              onChange={onPincode}
            />
          </label>
          <button type="button" className="secondary cpwa-loc-detect" onClick={detect} disabled={detecting}>
            {detecting ? t('c.loc.detecting') : t('c.loc.detect')}
          </button>
          <div className="cpwa-loc-actions">
            <button type="button" className="secondary" onClick={() => closeSheet(true)}>
              {t('c.loc.cancel')}
            </button>
            <button type="button" onClick={save}>
              {t('c.loc.save')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
