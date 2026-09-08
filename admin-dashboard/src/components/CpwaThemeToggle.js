import { useCallback, useEffect, useRef, useState } from 'react';
import { useLang } from '../lib/i18n';

const STORAGE_KEY = 'skhata-theme';
const OPTIONS = ['light', 'dark', 'gaon'];

// theme-color meta value per resolved appearance. Gaon and the classic system
// default resolve their light/dark half by the device preference.
const THEME_COLORS = {
  light: '#f6f8fa',
  dark: '#0f172a',
  gaonLight: '#FBF6EB',
  gaonDark: '#171410',
};

function prefersDark() {
  try {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  } catch (e) {
    return false;
  }
}

// The stored selection: one of 'light' | 'dark' | 'gaon', or 'system' when
// nothing (or an unknown value) is stored. SSR-guarded so it is safe on the
// server, where it returns the stable 'system' default.
function readSelectedTheme() {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'gaon') return stored;
  } catch (e) {
    /* storage blocked — fall through to system */
  }
  return 'system';
}

// The option currently marked in the picker: the active appearance. 'system'
// resolves to classic light/dark by the device so the live theme is highlighted.
function activeOption(selected) {
  if (selected === 'gaon' || selected === 'light' || selected === 'dark') return selected;
  return prefersDark() ? 'dark' : 'light';
}

// Keep the mobile browser chrome (address bar / status area) in step with the
// live theme. Gaon and the system default pick their light/dark half by the
// device preference; forced light/dark are literal.
function applyThemeColor(selected) {
  if (typeof document === 'undefined') return;
  let color;
  if (selected === 'gaon') color = prefersDark() ? THEME_COLORS.gaonDark : THEME_COLORS.gaonLight;
  else if (selected === 'dark') color = THEME_COLORS.dark;
  else if (selected === 'light') color = THEME_COLORS.light;
  else color = prefersDark() ? THEME_COLORS.dark : THEME_COLORS.light; // system → classic
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', color));
}

// A palette glyph — theme-neutral affordance for "choose appearance".
function PaletteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="8.5" cy="9.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="9.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="9" cy="15" r="1.2" fill="currentColor" stroke="none" />
      <path d="M12 12a3 3 0 0 0 3 3" />
    </svg>
  );
}

const SWATCHES = {
  light: { '--sw-bg': '#f6f8fa', '--sw-accent': '#22c55e' },
  dark: { '--sw-bg': '#0f172a', '--sw-accent': '#22c55e' },
  gaon: { '--sw-bg': '#FBF6EB', '--sw-accent': '#157A3A' },
};

// Theme picker for the consumer PWA topbar. A trigger button opens a small
// popover listing Light / Dark / Gaon Bazaar; the live selection is marked.
// Renders a stable trigger on the server + first client render (menu closed,
// static icon) to avoid a hydration mismatch, then reads the effective theme in
// a mount effect. The no-flash script in _document.js has already applied any
// STORED preference to <html> before paint; this keeps it in sync and lets the
// user switch. Persists to localStorage 'skhata-theme' (light|dark|gaon).
export default function CpwaThemeToggle() {
  const { t } = useLang();
  const [selected, setSelected] = useState('system');
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const itemRefs = useRef([]);

  useEffect(() => {
    setMounted(true);
    const sel = readSelectedTheme();
    setSelected(sel);
    applyThemeColor(sel); // align the status-bar chrome with the effective theme on load
  }, []);

  const choose = useCallback((value) => {
    if (typeof document !== 'undefined') {
      // 'light' | 'dark' | 'gaon' are all forced via data-theme.
      document.documentElement.setAttribute('data-theme', value);
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch (e) {
      /* storage blocked — the in-memory choice still applies for this session */
    }
    applyThemeColor(value);
    setSelected(value);
    setOpen(false);
    // Return focus to the trigger after selecting.
    if (btnRef.current) btnRef.current.focus();
  }, []);

  // Close on outside click / tap.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
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

  // When the menu opens, move focus to the checked (or first) option.
  useEffect(() => {
    if (!open) return;
    const idx = Math.max(0, OPTIONS.indexOf(activeOption(selected)));
    const el = itemRefs.current[idx];
    if (el) el.focus();
  }, [open, selected]);

  const onMenuKeyDown = (e) => {
    const count = OPTIONS.length;
    const current = itemRefs.current.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      if (btnRef.current) btnRef.current.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = itemRefs.current[(current + 1 + count) % count];
      if (next) next.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = itemRefs.current[(current - 1 + count) % count];
      if (prev) prev.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      if (itemRefs.current[0]) itemRefs.current[0].focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      if (itemRefs.current[count - 1]) itemRefs.current[count - 1].focus();
    }
  };

  const onTriggerKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const marked = mounted ? activeOption(selected) : null;
  const labels = { light: t('c.theme.light'), dark: t('c.theme.dark'), gaon: t('c.theme.gaon') };

  return (
    <div className="cpwa-theme-picker">
      <button
        ref={btnRef}
        type="button"
        className="secondary cpwa-theme-btn"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('c.theme.title')}
        title={t('c.theme.title')}
      >
        <PaletteIcon />
      </button>
      {open && (
        <ul
          ref={menuRef}
          className="cpwa-theme-menu"
          role="menu"
          aria-label={t('c.theme.title')}
          onKeyDown={onMenuKeyDown}
        >
          <li className="cpwa-theme-menu-title" aria-hidden="true">{t('c.theme.title')}</li>
          {OPTIONS.map((opt, i) => (
            <li key={opt} role="none">
              <button
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={marked === opt}
                className="cpwa-theme-opt"
                style={SWATCHES[opt]}
                onClick={() => choose(opt)}
              >
                <span className="cpwa-theme-swatch" aria-hidden="true" />
                <span className="cpwa-theme-opt-label">{labels[opt]}</span>
                <span className="cpwa-theme-check" aria-hidden="true">✓</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
