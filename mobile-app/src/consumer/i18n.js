import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { NativeModules, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Lightweight i18n for the native consumer app. A flat key -> string map per
// language, a t() with {var} interpolation, and a language setter persisted in
// expo-secure-store. en + hi are AUTHORED; ta/te/kn/ml/ur are SEEDED from en
// (so nothing is ever missing — they fall back to readable English) and can be
// filled in later without touching call sites.

const LANG_KEY = 'skhata_consumer_lang';

// The supported languages, in the order shown in the picker. `seeded: true`
// marks a language whose strings currently mirror en until translated.
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ta', label: 'தமிழ்', seeded: true },
  { code: 'te', label: 'తెలుగు', seeded: true },
  { code: 'kn', label: 'ಕನ್ನಡ', seeded: true },
  { code: 'ml', label: 'മലയാളം', seeded: true },
  { code: 'ur', label: 'اردو', seeded: true },
];

const en = {
  'app.name': 'Smart Digital Khata',
  'common.loading': 'Loading…',
  'common.retry': 'Retry',
  'common.cancel': 'Cancel',
  'common.back': 'Back',
  'common.close': 'Close',
  'common.search': 'Search',
  'common.save': 'Save',
  'common.total': 'Total',
  'common.subtotal': 'Subtotal',
  'common.items': 'Items',
  'common.status': 'Status',

  'tab.khata': 'Khata',
  'tab.shops': 'Shops',
  'tab.orders': 'Orders',
  'tab.account': 'Account',

  'login.title': 'Sign in',
  'login.blurb': 'See your khata across every shop, pay dues, and order — all in one place.',
  'login.mobile': 'Mobile number',
  'login.otpHint': 'We will send a 6-digit code on WhatsApp.',
  'login.sendCode': 'Send code',
  'login.sending': 'Sending…',
  'login.enterCode': 'Enter the code sent to {phone}',
  'login.codePlaceholder': '6-digit code',
  'login.verify': 'Verify & continue',
  'login.verifying': 'Verifying…',
  'login.changeNumber': 'Change number',
  'login.resend': 'Resend code',
  'login.devCode': 'Test code:',
  'login.failed': 'Could not sign in. Please try again.',

  'khata.title': 'My khata',
  'khata.totalOutstanding': 'Total you owe',
  'khata.loading': 'Loading your khata…',
  'khata.none': 'You have no khata at any shop yet.',
  'khata.balance': 'Balance',
  'khata.owe': 'You owe',
  'khata.advance': 'In advance',
  'khata.settled': 'All settled',
  'khata.limitSuffix': ' · limit {amt}',
  'khata.pay': 'Pay',
  'khata.opening': 'Opening…',

  'shopkhata.title': 'Shop khata',
  'shopkhata.loading': 'Loading entries…',
  'shopkhata.entries': 'Entries',
  'shopkhata.noEntries': 'No entries yet.',
  'shopkhata.payNow': 'Pay now',
  'shopkhata.payTitle': 'Pay {shop}',
  'shopkhata.amountRupees': 'Amount (₹)',
  'shopkhata.youOwe': 'You owe {amt}',
  'shopkhata.payFull': 'Pay full balance',
  'shopkhata.startPay': 'Continue to payment',
  'shopkhata.starting': 'Starting…',
  'shopkhata.enterAmount': 'Enter an amount to pay.',
  'shopkhata.overpay': 'Amount is more than you owe here.',
  'shopkhata.nothingDue': 'Nothing due at this shop.',
  'shopkhata.paySuccess': 'Payment complete. Refreshing your balance…',
  'txn.purchase': 'Purchase',
  'txn.payment': 'Payment',
  'txn.cash': 'Cash paid',
  'txn.credit': 'Credit',

  'pay.title': 'Payment',
  'pay.secure': 'You are paying securely on the shop’s payment page.',
  'pay.done': 'Done',
  'pay.cancelled': 'Payment not completed.',

  'shops.title': 'Discover shops',
  'shops.searchPlaceholder': 'Search shop or city',
  'shops.loading': 'Loading shops…',
  'shops.none': 'No shops found. Try a different search.',
  'shops.useLocation': 'Near me',
  'shops.locating': 'Finding you…',
  'shops.nearby': 'Nearby',
  'shops.locationOff': 'Location is not available. Showing all shops.',
  'shops.itemsCount': '{n} items',
  'shops.kmAway': '{km} km away',
  'shops.noLocation': 'Location not set',

  'shopdetail.loading': 'Loading catalog…',
  'shopdetail.noItems': 'This shop has not added items yet.',
  'shopdetail.perKg': '/ kg',
  'shopdetail.per': '/ {unit}',
  'shopdetail.unit': 'unit',
  'shopdetail.add': 'Add',
  'shopdetail.review': 'Review order',
  'shopdetail.deliveryFee': 'Delivery {amt}',
  'shopdetail.pickup': 'Pickup',
  'shopdetail.delivery': 'Delivery',

  'cart.title': 'Your cart',
  'cart.empty': 'Your cart is empty.',
  'cart.browse': 'Browse shops',
  'cart.fulfillment': 'How to get it',
  'cart.pickup': 'Pickup',
  'cart.delivery': 'Delivery',
  'cart.payment': 'Payment',
  'cart.onKhata': 'On khata',
  'cart.payOnline': 'Pay online',
  'cart.payCash': 'Cash',
  'cart.address': 'Delivery address',
  'cart.addressPlaceholder': 'House no, street, area, landmark',
  'cart.note': 'Note for the shop',
  'cart.notePlaceholder': 'e.g. call on arrival',
  'cart.deliveryFee': 'Delivery fee',
  'cart.freeDelivery': 'Free',
  'cart.placeOrder': 'Place order',
  'cart.placing': 'Placing…',
  'cart.addressRequired': 'Please enter a delivery address.',
  'cart.creditNote': 'Added to your khata at this shop.',
  'cart.prepaidNote': 'Pay now on the shop’s secure page.',
  'cart.cashNote': 'Pay cash on pickup or delivery.',
  'cart.remove': 'Remove',

  'orders.title': 'My orders',
  'orders.loading': 'Loading your orders…',
  'orders.none': 'You have no orders yet.',
  'orders.itemsCount': '{n} items',

  'orderdetail.title': 'Order',
  'orderdetail.loading': 'Loading order…',
  'orderdetail.deliverTo': 'Deliver to:',
  'orderdetail.note': 'Note:',
  'orderdetail.payment': 'Payment:',
  'orderdetail.cancel': 'Cancel order',
  'orderdetail.cancelling': 'Cancelling…',
  'orderdetail.cancelConfirm': 'Cancel this order?',
  'orderdetail.deliveryFee': 'Delivery fee',

  'ostatus.pending': 'Pending',
  'ostatus.accepted': 'Accepted',
  'ostatus.preparing': 'Preparing',
  'ostatus.ready': 'Ready',
  'ostatus.out_for_delivery': 'Out for delivery',
  'ostatus.completed': 'Completed',
  'ostatus.cancelled': 'Cancelled',
  'pmode.credit': 'On khata',
  'pmode.prepaid': 'Online',
  'pmode.cash': 'Cash',
  'pstatus.paid': 'Paid',

  'account.title': 'Account',
  'account.profile': 'Profile',
  'account.subtitle': 'All fields optional. Your phone is your login and cannot change here.',
  'account.name': 'Name',
  'account.phone': 'Phone',
  'account.email': 'Email',
  'account.optional': 'optional',
  'account.save': 'Save',
  'account.saving': 'Saving…',
  'account.saved': 'Saved.',
  'account.loadError': 'Could not load your profile.',
  'account.language': 'Language',
  'account.logout': 'Log out',
  'account.logoutConfirm': 'Log out of Smart Digital Khata?',
};

const hi = {
  'app.name': 'स्मार्ट डिजिटल खाता',
  'common.loading': 'लोड हो रहा है…',
  'common.retry': 'फिर कोशिश करें',
  'common.cancel': 'रद्द करें',
  'common.back': 'वापस',
  'common.close': 'बंद करें',
  'common.search': 'खोजें',
  'common.save': 'सेव करें',
  'common.total': 'कुल',
  'common.subtotal': 'उप-योग',
  'common.items': 'सामान',
  'common.status': 'स्थिति',

  'tab.khata': 'खाता',
  'tab.shops': 'दुकानें',
  'tab.orders': 'ऑर्डर',
  'tab.account': 'खाता-सेटिंग',

  'login.title': 'साइन इन करें',
  'login.blurb': 'हर दुकान का अपना खाता देखें, बकाया चुकाएँ और ऑर्डर करें — सब एक जगह।',
  'login.mobile': 'मोबाइल नंबर',
  'login.otpHint': 'हम व्हाट्सऐप पर 6 अंकों का कोड भेजेंगे।',
  'login.sendCode': 'कोड भेजें',
  'login.sending': 'भेजा जा रहा है…',
  'login.enterCode': '{phone} पर भेजा गया कोड डालें',
  'login.codePlaceholder': '6 अंकों का कोड',
  'login.verify': 'सत्यापित करें व आगे बढ़ें',
  'login.verifying': 'सत्यापित हो रहा है…',
  'login.changeNumber': 'नंबर बदलें',
  'login.resend': 'कोड फिर भेजें',
  'login.devCode': 'टेस्ट कोड:',
  'login.failed': 'साइन इन नहीं हो सका। फिर कोशिश करें।',

  'khata.title': 'मेरा खाता',
  'khata.totalOutstanding': 'कुल बकाया',
  'khata.loading': 'आपका खाता लोड हो रहा है…',
  'khata.none': 'अभी किसी दुकान पर आपका खाता नहीं है।',
  'khata.balance': 'बैलेंस',
  'khata.owe': 'आप पर बकाया',
  'khata.advance': 'अग्रिम जमा',
  'khata.settled': 'पूरा चुकता',
  'khata.limitSuffix': ' · सीमा {amt}',
  'khata.pay': 'भुगतान',
  'khata.opening': 'खुल रहा है…',

  'shopkhata.title': 'दुकान का खाता',
  'shopkhata.loading': 'एंट्री लोड हो रही हैं…',
  'shopkhata.entries': 'एंट्री',
  'shopkhata.noEntries': 'अभी कोई एंट्री नहीं।',
  'shopkhata.payNow': 'अभी भुगतान करें',
  'shopkhata.payTitle': '{shop} को भुगतान',
  'shopkhata.amountRupees': 'राशि (₹)',
  'shopkhata.youOwe': 'आप पर {amt} बकाया',
  'shopkhata.payFull': 'पूरा बकाया चुकाएँ',
  'shopkhata.startPay': 'भुगतान पर जाएँ',
  'shopkhata.starting': 'शुरू हो रहा है…',
  'shopkhata.enterAmount': 'भुगतान की राशि डालें।',
  'shopkhata.overpay': 'राशि आपके बकाया से अधिक है।',
  'shopkhata.nothingDue': 'इस दुकान पर कुछ बकाया नहीं।',
  'shopkhata.paySuccess': 'भुगतान पूरा। बैलेंस अपडेट हो रहा है…',
  'txn.purchase': 'खरीद',
  'txn.payment': 'भुगतान',
  'txn.cash': 'नकद भुगतान',
  'txn.credit': 'उधार',

  'pay.title': 'भुगतान',
  'pay.secure': 'आप दुकान के सुरक्षित पेज पर भुगतान कर रहे हैं।',
  'pay.done': 'हो गया',
  'pay.cancelled': 'भुगतान पूरा नहीं हुआ।',

  'shops.title': 'दुकानें खोजें',
  'shops.searchPlaceholder': 'दुकान या शहर खोजें',
  'shops.loading': 'दुकानें लोड हो रही हैं…',
  'shops.none': 'कोई दुकान नहीं मिली। दूसरी खोज आज़माएँ।',
  'shops.useLocation': 'मेरे पास',
  'shops.locating': 'आपको ढूँढ रहे हैं…',
  'shops.nearby': 'आस-पास',
  'shops.locationOff': 'लोकेशन उपलब्ध नहीं। सभी दुकानें दिखा रहे हैं।',
  'shops.itemsCount': '{n} सामान',
  'shops.kmAway': '{km} किमी दूर',
  'shops.noLocation': 'स्थान नहीं दिया',

  'shopdetail.loading': 'कैटलॉग लोड हो रहा है…',
  'shopdetail.noItems': 'इस दुकान ने अभी सामान नहीं जोड़ा।',
  'shopdetail.perKg': '/ किलो',
  'shopdetail.per': '/ {unit}',
  'shopdetail.unit': 'नग',
  'shopdetail.add': 'जोड़ें',
  'shopdetail.review': 'ऑर्डर देखें',
  'shopdetail.deliveryFee': 'डिलीवरी {amt}',
  'shopdetail.pickup': 'खुद ले जाएँ',
  'shopdetail.delivery': 'डिलीवरी',

  'cart.title': 'आपकी टोकरी',
  'cart.empty': 'आपकी टोकरी खाली है।',
  'cart.browse': 'दुकानें देखें',
  'cart.fulfillment': 'कैसे लेंगे',
  'cart.pickup': 'खुद ले जाएँ',
  'cart.delivery': 'डिलीवरी',
  'cart.payment': 'भुगतान',
  'cart.onKhata': 'खाते पर',
  'cart.payOnline': 'ऑनलाइन भुगतान',
  'cart.payCash': 'नकद',
  'cart.address': 'डिलीवरी पता',
  'cart.addressPlaceholder': 'मकान नं, गली, इलाका, पहचान',
  'cart.note': 'दुकान के लिए नोट',
  'cart.notePlaceholder': 'जैसे पहुँचने पर कॉल करें',
  'cart.deliveryFee': 'डिलीवरी शुल्क',
  'cart.freeDelivery': 'मुफ़्त',
  'cart.placeOrder': 'ऑर्डर करें',
  'cart.placing': 'ऑर्डर हो रहा है…',
  'cart.addressRequired': 'कृपया डिलीवरी पता डालें।',
  'cart.creditNote': 'इस दुकान पर आपके खाते में जुड़ेगा।',
  'cart.prepaidNote': 'दुकान के सुरक्षित पेज पर अभी भुगतान करें।',
  'cart.cashNote': 'लेते समय नकद भुगतान करें।',
  'cart.remove': 'हटाएँ',

  'orders.title': 'मेरे ऑर्डर',
  'orders.loading': 'आपके ऑर्डर लोड हो रहे हैं…',
  'orders.none': 'अभी आपका कोई ऑर्डर नहीं।',
  'orders.itemsCount': '{n} सामान',

  'orderdetail.title': 'ऑर्डर',
  'orderdetail.loading': 'ऑर्डर लोड हो रहा है…',
  'orderdetail.deliverTo': 'यहाँ पहुँचाएँ:',
  'orderdetail.note': 'नोट:',
  'orderdetail.payment': 'भुगतान:',
  'orderdetail.cancel': 'ऑर्डर रद्द करें',
  'orderdetail.cancelling': 'रद्द हो रहा है…',
  'orderdetail.cancelConfirm': 'यह ऑर्डर रद्द करें?',
  'orderdetail.deliveryFee': 'डिलीवरी शुल्क',

  'ostatus.pending': 'लंबित',
  'ostatus.accepted': 'स्वीकृत',
  'ostatus.preparing': 'तैयार हो रहा',
  'ostatus.ready': 'तैयार',
  'ostatus.out_for_delivery': 'भेजा गया',
  'ostatus.completed': 'पूरा हुआ',
  'ostatus.cancelled': 'रद्द',
  'pmode.credit': 'खाते पर',
  'pmode.prepaid': 'ऑनलाइन',
  'pmode.cash': 'नकद',
  'pstatus.paid': 'भुगतान हो गया',

  'account.title': 'खाता-सेटिंग',
  'account.profile': 'प्रोफ़ाइल',
  'account.subtitle': 'सभी जानकारी वैकल्पिक। आपका फ़ोन आपका लॉगिन है, यहाँ नहीं बदलेगा।',
  'account.name': 'नाम',
  'account.phone': 'फ़ोन',
  'account.email': 'ईमेल',
  'account.optional': 'वैकल्पिक',
  'account.save': 'सेव करें',
  'account.saving': 'सेव हो रहा है…',
  'account.saved': 'सेव हो गया।',
  'account.loadError': 'प्रोफ़ाइल लोड नहीं हो सकी।',
  'account.language': 'भाषा',
  'account.logout': 'लॉग आउट',
  'account.logoutConfirm': 'स्मार्ट डिजिटल खाता से लॉग आउट करें?',
};

// ta/te/kn/ml/ur are seeded from en for now (full en fallback = readable UI in
// every language). Translating any of these later is just filling in its map.
const DICTS = {
  en,
  hi,
  ta: { ...en },
  te: { ...en },
  kn: { ...en },
  ml: { ...en },
  ur: { ...en },
};

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}

// Pure translate against a given language code — used by the hook below.
export function translate(lang, key, vars) {
  const dict = DICTS[lang] || en;
  const s = dict[key] != null ? dict[key] : (en[key] != null ? en[key] : key);
  return interpolate(s, vars);
}

// Best-effort device language (2-letter), falling back to 'en'. Never throws.
function deviceLang() {
  try {
    let loc = '';
    if (Platform.OS === 'ios') {
      const s = NativeModules.SettingsManager && NativeModules.SettingsManager.settings;
      loc = (s && (s.AppleLocale || (s.AppleLanguages && s.AppleLanguages[0]))) || '';
    } else {
      loc = (NativeModules.I18nManager && NativeModules.I18nManager.localeIdentifier) || '';
    }
    const two = String(loc).slice(0, 2).toLowerCase();
    return DICTS[two] ? two : 'en';
  } catch (e) {
    return 'en';
  }
}

async function loadStoredLang() {
  try {
    const v = await SecureStore.getItemAsync(LANG_KEY);
    if (v && DICTS[v]) return v;
  } catch (e) { /* ignore */ }
  return deviceLang();
}

const LangContext = createContext({
  lang: 'en',
  t: (k, vars) => translate('en', k, vars),
  setLang: () => {},
});

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState('en');

  useEffect(() => {
    let alive = true;
    loadStoredLang().then((l) => { if (alive) setLangState(l); });
    return () => { alive = false; };
  }, []);

  const setLang = useCallback((l) => {
    if (!DICTS[l]) return;
    setLangState(l);
    SecureStore.setItemAsync(LANG_KEY, l).catch(() => {});
  }, []);

  const value = useMemo(() => ({
    lang,
    setLang,
    t: (key, vars) => translate(lang, key, vars),
  }), [lang, setLang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useT() {
  return useContext(LangContext);
}
