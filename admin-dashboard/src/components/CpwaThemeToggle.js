import { useEffect, useState } from 'react';
import { useLang } from '../lib/i18n';

const STORAGE_KEY = 'skhata-theme';

// Read the effective theme without touching the DOM during render: a stored
// choice wins, otherwise fall back to the device preference. SSR-guarded so it
// is safe to call on the server (returns 'light', the stable initial icon).
function readEffectiveTheme() {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch (e) {
    /* storage blocked — fall through to the media query */
  }
  try {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  } catch (e) {
    /* matchMedia unavailable */
  }
  return 'light';
}

// Sun icon — shown when the app is dark (tap to switch to light).
function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

// Moon icon — shown when the app is light (tap to switch to dark).
function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

// Light/dark toggle for the consumer PWA topbar. Renders a stable initial icon
// on the server + first client render (avoids hydration mismatch) and corrects
// it to the effective theme in a mount effect. The no-flash script in
// _document.js has already applied any STORED preference to <html> before paint;
// this component keeps it in sync and lets the user flip it.
export default function CpwaThemeToggle() {
  const { t } = useLang();
  const [theme, setTheme] = useState('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTheme(readEffectiveTheme());
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', next);
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch (e) {
      /* storage blocked — the in-memory toggle still works for this session */
    }
    setTheme(next);
  };

  // Before mount, render the stable light-state icon (moon) so server and client
  // markup match; the effect above corrects it immediately after hydration.
  const isDark = mounted && theme === 'dark';

  return (
    <button
      type="button"
      className="secondary cpwa-theme-btn"
      onClick={toggle}
      aria-label={t('c.toggleTheme')}
      title={t('c.toggleTheme')}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
