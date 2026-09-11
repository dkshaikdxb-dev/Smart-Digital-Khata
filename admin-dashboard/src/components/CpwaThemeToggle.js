import { useCallback, useEffect, useRef, useState } from 'react';
import { useLang } from '../lib/i18n';

const THEME_KEY = 'skhata-theme';
const LAYOUT_KEY = 'skhata-layout';
const THEME_OPTIONS = ['light', 'dark', 'warm'];
const LAYOUT_OPTIONS = ['standard', 'gaon'];

// theme-color meta value per resolved appearance. Warm and the classic system
// default resolve their light/dark half by the device preference.
const THEME_COLORS = {
  light: '#f6f8fa',
  dark: '#0f172a',
  warmLight: '#FBF6EB',
  warmDark: '#171410',
};

function prefersDark() {
  try {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  } catch (e) {
    return false;
  }
}

// The stored colour selection: one of 'light' | 'dark' | 'warm', or 'system' when
// nothing (or an unknown value) is stored. A legacy 'gaon' value (the old name of
// the warm palette) is read as 'warm'. SSR-guarded so it is safe on the server,
// where it returns the stable 'system' default.
function readSelectedTheme() {
  if (typeof window === 'undefined') return 'system';
  try {
    let stored = window.localStorage.getItem(THEME_KEY);
    if (stored === 'gaon') stored = 'warm';
    if (stored === 'light' || stored === 'dark' || stored === 'warm') return stored;
  } catch (e) {
    /* storage blocked — fall through to system */
  }
  return 'system';
}

// The stored layout selection: 'gaon' for the Gaon Bazaar layout, otherwise
// 'standard' (the default). SSR-guarded to the stable 'standard' default.
function readSelectedLayout() {
  if (typeof window === 'undefined') return 'standard';
  try {
    if (window.localStorage.getItem(LAYOUT_KEY) === 'gaon') return 'gaon';
  } catch (e) {
    /* storage blocked — fall through to standard */
  }
  return 'standard';
}

// The colour option currently marked in the picker: the active appearance.
// 'system' resolves to classic light/dark by the device so the live theme is
// highlighted.
function activeTheme(selected) {
  if (selected === 'warm' || selected === 'light' || selected === 'dark') return selected;
  return prefersDark() ? 'dark' : 'light';
}

// Keep the mobile browser chrome (address bar / status area) in step with the
// live colour theme. Warm and the system default pick their light/dark half by
// the device preference; forced light/dark are literal.
function applyThemeColor(selected) {
  if (typeof document === 'undefined') return;
  let color;
  if (selected === 'warm') color = prefersDark() ? THEME_COLORS.warmDark : THEME_COLORS.warmLight;
  else if (selected === 'dark') color = THEME_COLORS.dark;
  else if (selected === 'light') color = THEME_COLORS.light;
  else color = prefersDark() ? THEME_COLORS.dark : THEME_COLORS.light; // system → classic
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', color));
}

// A sliders/adjust glyph — a clear, theme-neutral "choose appearance" affordance
// (the earlier palette-circle read as a small face at 18px). Two tracks with
// knobs, echoing the two axes the menu controls (theme + layout).
function PaletteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="8" x2="20" y2="8" />
      <line x1="4" y1="16" x2="20" y2="16" />
      <circle cx="9" cy="8" r="2.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="16" r="2.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Tiny appearance-menu preview swatches. Kept in step with the retuned per-theme
// accents in globals.css (deep emerald in light, brighter green in dark, forest
// green on warm paper) so the preview is truthful.
const SWATCHES = {
  light: { '--sw-bg': '#f6f8fa', '--sw-accent': '#15803d' },
  dark: { '--sw-bg': '#0f172a', '--sw-accent': '#2dd36a' },
  warm: { '--sw-bg': '#FBF6EB', '--sw-accent': '#157A3A' },
};

// Appearance picker for the consumer PWA topbar. A trigger button opens a small
// popover with two independent, labelled radio groups: Theme (Light / Dark /
// Warm — a colour axis) and Layout (Standard / Gaon Bazaar — a structural axis).
// The two are orthogonal: any theme combines with any layout. The live selection
// in each group is marked. Renders a stable trigger on the server + first client
// render (menu closed, static icon) to avoid a hydration mismatch, then reads the
// effective preferences in a mount effect. The no-flash script in _document.js
// has already applied any STORED preferences to <html> before paint; this keeps
// them in sync and lets the user switch. Persists to localStorage 'skhata-theme'
// (light|dark|warm) and 'skhata-layout' (standard|gaon).
export default function CpwaThemeToggle() {
  const { t } = useLang();
  const [theme, setTheme] = useState('system');
  const [layout, setLayout] = useState('standard');
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const itemRefs = useRef([]);

  useEffect(() => {
    setMounted(true);
    const th = readSelectedTheme();
    setTheme(th);
    setLayout(readSelectedLayout());
    applyThemeColor(th); // align the status-bar chrome with the effective theme on load
  }, []);

  const chooseTheme = useCallback((value) => {
    if (typeof document !== 'undefined') {
      // 'light' | 'dark' | 'warm' are all forced via data-theme.
      document.documentElement.setAttribute('data-theme', value);
    }
    try {
      window.localStorage.setItem(THEME_KEY, value);
    } catch (e) {
      /* storage blocked — the in-memory choice still applies for this session */
    }
    applyThemeColor(value);
    setTheme(value);
    if (btnRef.current) btnRef.current.focus();
  }, []);

  const chooseLayout = useCallback((value) => {
    if (typeof document !== 'undefined') {
      if (value === 'gaon') document.documentElement.setAttribute('data-cpwa-layout', 'gaon');
      else document.documentElement.removeAttribute('data-cpwa-layout');
    }
    try {
      window.localStorage.setItem(LAYOUT_KEY, value);
    } catch (e) {
      /* storage blocked — the in-memory choice still applies for this session */
    }
    setLayout(value);
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

  // The flat list of focusable options, theme group then layout group, so a
  // single Arrow/Home/End model walks the whole menu.
  const flatItems = [
    ...THEME_OPTIONS.map((v) => ({ group: 'theme', value: v })),
    ...LAYOUT_OPTIONS.map((v) => ({ group: 'layout', value: v })),
  ];

  // When the menu opens, move focus to the checked theme option.
  useEffect(() => {
    if (!open) return;
    const idx = Math.max(0, THEME_OPTIONS.indexOf(activeTheme(theme)));
    const el = itemRefs.current[idx];
    if (el) el.focus();
  }, [open, theme]);

  const onMenuKeyDown = (e) => {
    const count = flatItems.length;
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

  const markedTheme = mounted ? activeTheme(theme) : null;
  const markedLayout = mounted ? layout : null;
  const themeLabels = { light: t('c.theme.light'), dark: t('c.theme.dark'), warm: t('c.theme.warm') };
  const layoutLabels = { standard: t('c.layout.standard'), gaon: t('c.layout.gaon') };

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
        aria-label={t('c.appearance.title')}
        title={t('c.appearance.title')}
      >
        <PaletteIcon />
      </button>
      {open && (
        <ul
          ref={menuRef}
          className="cpwa-theme-menu"
          role="menu"
          aria-label={t('c.appearance.title')}
          onKeyDown={onMenuKeyDown}
        >
          <li className="cpwa-theme-menu-title" aria-hidden="true">{t('c.theme.title')}</li>
          <li role="group" aria-label={t('c.theme.title')}>
            <ul className="cpwa-theme-group">
              {THEME_OPTIONS.map((opt, i) => (
                <li key={opt} role="none">
                  <button
                    ref={(el) => {
                      itemRefs.current[i] = el;
                    }}
                    type="button"
                    role="menuitemradio"
                    aria-checked={markedTheme === opt}
                    className="cpwa-theme-opt"
                    style={SWATCHES[opt]}
                    onClick={() => chooseTheme(opt)}
                  >
                    <span className="cpwa-theme-swatch" aria-hidden="true" />
                    <span className="cpwa-theme-opt-label">{themeLabels[opt]}</span>
                    <span className="cpwa-theme-check" aria-hidden="true">✓</span>
                  </button>
                </li>
              ))}
            </ul>
          </li>
          <li className="cpwa-theme-menu-title cpwa-theme-menu-title-2" aria-hidden="true">{t('c.layout.title')}</li>
          <li role="group" aria-label={t('c.layout.title')}>
            <ul className="cpwa-theme-group">
              {LAYOUT_OPTIONS.map((opt, i) => (
                <li key={opt} role="none">
                  <button
                    ref={(el) => {
                      itemRefs.current[THEME_OPTIONS.length + i] = el;
                    }}
                    type="button"
                    role="menuitemradio"
                    aria-checked={markedLayout === opt}
                    className="cpwa-theme-opt"
                    onClick={() => chooseLayout(opt)}
                  >
                    <span className={`cpwa-layout-ico cpwa-layout-ico-${opt}`} aria-hidden="true" />
                    <span className="cpwa-theme-opt-label">{layoutLabels[opt]}</span>
                    <span className="cpwa-theme-check" aria-hidden="true">✓</span>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        </ul>
      )}
    </div>
  );
}
