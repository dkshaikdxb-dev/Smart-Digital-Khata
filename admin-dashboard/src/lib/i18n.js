import { useEffect, useState } from 'react';

// Lightweight i18n for NAVIGATION CHROME ONLY (owner top-nav + customer tab
// bar). Page bodies are intentionally not translated yet — this is a scoped
// first step. Adding a regional language is just another block in DICT plus a
// row in LANGS; every nav label and the language switch pick it up
// automatically.

// English + Hindi + the four major South Indian (Dravidian) languages. Each
// language is one row here plus one block in DICT below; the nav labels and the
// language switch pick it up automatically. Nav-label translations are standard
// UI terms — worth a native-speaker QA pass before a wide regional rollout.
export const LANGS = [
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'hi', label: 'हिं', name: 'हिन्दी' },
  { code: 'ta', label: 'த', name: 'தமிழ்' },
  { code: 'te', label: 'తె', name: 'తెలుగు' },
  { code: 'kn', label: 'ಕ', name: 'ಕನ್ನಡ' },
  { code: 'ml', label: 'മ', name: 'മലയാളം' },
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
  ta: {
    'nav.dashboard': 'டாஷ்போர்டு',
    'nav.catalog': 'பட்டியல்',
    'nav.orders': 'ஆர்டர்கள்',
    'nav.customers': 'வாடிக்கையாளர்கள்',
    'nav.families': 'குடும்பங்கள்',
    'nav.transactions': 'பரிவர்த்தனைகள்',
    'nav.insights': 'பகுப்பாய்வு',
    'nav.settings': 'அமைப்புகள்',
    'nav.platform': 'தளம்',
    'nav.logout': 'வெளியேறு',
    'ctab.shops': 'கடைகள்',
    'ctab.orders': 'ஆர்டர்கள்',
    'ctab.khata': 'கணக்கு',
    'ctab.logout': 'வெளியேறு',
  },
  te: {
    'nav.dashboard': 'డాష్‌బోర్డ్',
    'nav.catalog': 'జాబితా',
    'nav.orders': 'ఆర్డర్‌లు',
    'nav.customers': 'వినియోగదారులు',
    'nav.families': 'కుటుంబాలు',
    'nav.transactions': 'లావాదేవీలు',
    'nav.insights': 'విశ్లేషణ',
    'nav.settings': 'సెట్టింగ్‌లు',
    'nav.platform': 'ప్లాట్‌ఫారమ్',
    'nav.logout': 'లాగ్ అవుట్',
    'ctab.shops': 'దుకాణాలు',
    'ctab.orders': 'ఆర్డర్‌లు',
    'ctab.khata': 'ఖాతా',
    'ctab.logout': 'లాగ్ అవుట్',
  },
  kn: {
    'nav.dashboard': 'ಡ್ಯಾಶ್‌ಬೋರ್ಡ್',
    'nav.catalog': 'ಪಟ್ಟಿ',
    'nav.orders': 'ಆರ್ಡರ್‌ಗಳು',
    'nav.customers': 'ಗ್ರಾಹಕರು',
    'nav.families': 'ಕುಟುಂಬಗಳು',
    'nav.transactions': 'ವ್ಯವಹಾರಗಳು',
    'nav.insights': 'ವಿಶ್ಲೇಷಣೆ',
    'nav.settings': 'ಸೆಟ್ಟಿಂಗ್‌ಗಳು',
    'nav.platform': 'ವೇದಿಕೆ',
    'nav.logout': 'ಲಾಗ್ ಔಟ್',
    'ctab.shops': 'ಅಂಗಡಿಗಳು',
    'ctab.orders': 'ಆರ್ಡರ್‌ಗಳು',
    'ctab.khata': 'ಖಾತೆ',
    'ctab.logout': 'ಲಾಗ್ ಔಟ್',
  },
  ml: {
    'nav.dashboard': 'ഡാഷ്‌ബോർഡ്',
    'nav.catalog': 'പട്ടിക',
    'nav.orders': 'ഓർഡറുകൾ',
    'nav.customers': 'ഉപഭോക്താക്കൾ',
    'nav.families': 'കുടുംബങ്ങൾ',
    'nav.transactions': 'ഇടപാടുകൾ',
    'nav.insights': 'വിശകലനം',
    'nav.settings': 'ക്രമീകരണങ്ങൾ',
    'nav.platform': 'പ്ലാറ്റ്‌ഫോം',
    'nav.logout': 'ലോഗ് ഔട്ട്',
    'ctab.shops': 'കടകൾ',
    'ctab.orders': 'ഓർഡറുകൾ',
    'ctab.khata': 'കണക്ക്',
    'ctab.logout': 'ലോഗ് ഔട്ട്',
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
