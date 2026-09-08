import { useCallback, useEffect, useRef, useState } from 'react';
import { useLang } from '../lib/i18n';
import { getCustomerToken, customerFetch, publicFetch } from '../lib/customerApi';

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
}

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
export default function CpwaLocationPicker() {
  const { t } = useLang();
  const [mounted, setMounted] = useState(false);
  const [saved, setSaved] = useState(EMPTY); // the persisted location (chip source)
  const [form, setForm] = useState(EMPTY); // the in-sheet draft
  const [open, setOpen] = useState(false);
  const [detecting, setDetecting] = useState(false);
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
