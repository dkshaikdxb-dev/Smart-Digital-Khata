import { useEffect, useState } from 'react';

// Lightweight i18n for NAVIGATION CHROME ONLY (owner top-nav + customer tab
// bar). Page bodies are intentionally not translated yet — this is a scoped
// first step. Adding a regional language is just another block in DICT plus a
// row in LANGS; every nav label and the language switch pick it up
// automatically.

export const LANGS = [
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'hi', label: 'हिं', name: 'हिन्दी' },
  // To add e.g. Marathi: { code: 'mr', label: 'मरा', name: 'मराठी' } + a `mr` block below.
];

const DICT = {
  en: {
    'nav.dashboard': 'Dashboard',
    'nav.catalog': 'Catalog',
    'nav.orders': 'Orders',
    'nav.customers': 'Customers',
    'nav.families': 'Families',
    'nav.transactions': 'Transactions',
    'nav.insights': 'Insights',
    'nav.settings': 'Settings',
    'nav.platform': 'Platform',
    'nav.logout': 'Log out',
    'ctab.shops': 'Shops',
    'ctab.orders': 'Orders',
    'ctab.khata': 'Khata',
    'ctab.logout': 'Logout',
  },
  hi: {
    'nav.dashboard': 'डैशबोर्ड',
    'nav.catalog': 'कैटलॉग',
    'nav.orders': 'ऑर्डर',
    'nav.customers': 'ग्राहक',
    'nav.families': 'परिवार',
    'nav.transactions': 'लेन-देन',
    'nav.insights': 'विश्लेषण',
    'nav.settings': 'सेटिंग्स',
    'nav.platform': 'प्लेटफ़ॉर्म',
    'nav.logout': 'लॉग आउट',
    'ctab.shops': 'दुकानें',
    'ctab.orders': 'ऑर्डर',
    'ctab.khata': 'खाता',
    'ctab.logout': 'लॉग आउट',
  },
};

const KEY = 'skhata_lang';
const EVENT = 'skhata-lang';

export function getLang() {
  if (typeof window === 'undefined') return 'en';
  try {
    const v = window.localStorage.getItem(KEY);
    return DICT[v] ? v : 'en';
  } catch {
    return 'en';
  }
}

export function setLang(code) {
  const next = DICT[code] ? code : 'en';
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    /* storage blocked */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

export function translate(lang, key) {
  return (DICT[lang] && DICT[lang][key]) || DICT.en[key] || key;
}

/**
 * Current language + a translator, re-rendering when the language changes in
 * this tab (custom event) or another tab (storage event). SSR-safe: the first
 * render is always 'en' on both server and client, so hydration never mismatches;
 * the stored choice is applied in the effect right after mount.
 */
export function useLang() {
  const [lang, setLangState] = useState('en');
  useEffect(() => {
    setLangState(getLang());
    const on = () => setLangState(getLang());
    window.addEventListener(EVENT, on);
    window.addEventListener('storage', on);
    return () => {
      window.removeEventListener(EVENT, on);
      window.removeEventListener('storage', on);
    };
  }, []);
  const change = (code) => {
    setLang(code);
    setLangState(DICT[code] ? code : 'en');
  };
  return { lang, setLang: change, t: (key) => translate(lang, key) };
}
