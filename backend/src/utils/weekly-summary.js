// Owner Help "lane B" — the weekly WhatsApp summary composer (Batch J). PURE and
// DETERMINISTIC: given an already-aggregated, SHOP-SCOPED `shopData` payload (Σ
// over the shop's own rows for the last 7 days) and a language code, it returns
// the structured summary plus ONE plain-language, single-line WhatsApp message in
// the owner's language. No I/O, no clock, no randomness, no AI — the same
// (shopData, lang) always yields the same message, so it is trivially unit-
// testable WITHOUT Redis or a live DB.
//
// Money is integer paise everywhere the data flows; rupee grouping happens ONLY
// at display time (fmtINR) so the amounts the message quotes are exact sums from
// transactions. Counts and the weekday index are plain numbers.
//
// The message mirrors the frontend own.weekly.* i18n strings; this backend copy
// is the source of truth for the WhatsApp text (the backend does not load the
// admin dashboard's i18n.js — the daily digest is composed server-side the same
// way). All seven languages are authored natively (en + hi + ta/te/kn/ml/ur), so
// a regional owner receives the weekly WhatsApp in their own language. Urdu (ur)
// is RTL — the numbers interpolate as data so they stay RTL-safe.

const LANGS = ['en', 'hi', 'ta', 'te', 'kn', 'ml', 'ur'];
const FALLBACK_ORDER = Object.freeze(['hi', 'en']); // owner lang → hi → en

// Per-language weekday names (dow 0=Sunday..6=Saturday), matching the frontend
// own.day.* keys so the "best day" reads naturally in the owner's language.
const DAYS = Object.freeze({
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  hi: ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'],
  ta: ['ஞாயிறு', 'திங்கள்', 'செவ்வாய்', 'புதன்', 'வியாழன்', 'வெள்ளி', 'சனி'],
  te: ['ఆదివారం', 'సోమవారం', 'మంగళవారం', 'బుధవారం', 'గురువారం', 'శుక్రవారం', 'శనివారం'],
  kn: ['ಭಾನುವಾರ', 'ಸೋಮವಾರ', 'ಮಂಗಳವಾರ', 'ಬುಧವಾರ', 'ಗುರುವಾರ', 'ಶುಕ್ರವಾರ', 'ಶನಿವಾರ'],
  ml: ['ഞായർ', 'തിങ്കൾ', 'ചൊവ്വ', 'ബുധൻ', 'വ്യാഴം', 'വെള്ളി', 'ശനി'],
  ur: ['اتوار', 'پیر', 'منگل', 'بدھ', 'جمعرات', 'جمعہ', 'ہفتہ'],
});

// Message parts. Each is a template with {amount}/{n}/{day}/{item} placeholders;
// amounts arrive already ₹-grouped (fmtINR) as strings, counts/items as data. The
// composer joins the present parts with " · " under `header` and ends with a stop.
const T = Object.freeze({
  en: {
    header: 'This week at your shop',
    collected: '₹{amount} collected',
    udhaar: '₹{amount} new udhaar',
    dues: '₹{amount} pending ({n} customers)',
    best_day: 'best day {day}',
    top_item: 'top seller {item}',
    quiet: 'A quiet week — no sales or collections recorded. Add an entry when your next customer buys.',
    stop: '.',
  },
  hi: {
    header: 'इस हफ़्ते आपकी दुकान',
    collected: '₹{amount} वसूली',
    udhaar: '₹{amount} नया उधार',
    dues: '₹{amount} बाकी ({n} ग्राहक)',
    best_day: 'सबसे अच्छा दिन {day}',
    top_item: 'सबसे ज़्यादा बिका {item}',
    quiet: 'इस हफ़्ते कोई बिक्री या वसूली दर्ज नहीं हुई। अगले ग्राहक की खरीद पर एंट्री जोड़ें।',
    stop: '।',
  },
  ta: {
    header: 'இந்த வாரம் உங்கள் கடையில்',
    collected: '₹{amount} வசூல் ஆனது',
    udhaar: '₹{amount} புதிய உதார்',
    dues: '₹{amount} நிலுவையில் ({n} வாடிக்கையாளர்கள்)',
    best_day: 'சிறந்த நாள் {day}',
    top_item: 'அதிகம் விற்றது {item}',
    quiet: 'இந்த வாரம் விற்பனையோ வசூலோ பதிவாகவில்லை. அடுத்த வாடிக்கையாளர் வாங்கும்போது ஒரு பதிவைச் சேர்க்கவும்.',
    stop: '.',
  },
  te: {
    header: 'ఈ వారం మీ దుకాణంలో',
    collected: '₹{amount} వసూలైంది',
    udhaar: '₹{amount} కొత్త ఉధార్',
    dues: '₹{amount} బాకీ ({n} వినియోగదారులు)',
    best_day: 'ఉత్తమ రోజు {day}',
    top_item: 'ఎక్కువగా అమ్ముడైనది {item}',
    quiet: 'ఈ వారం అమ్మకాలు గానీ వసూళ్లు గానీ నమోదు కాలేదు. తదుపరి వినియోగదారు కొన్నప్పుడు ఒక ఎంట్రీ జోడించండి.',
    stop: '.',
  },
  kn: {
    header: 'ಈ ವಾರ ನಿಮ್ಮ ಅಂಗಡಿಯಲ್ಲಿ',
    collected: '₹{amount} ವಸೂಲಿಯಾಗಿದೆ',
    udhaar: '₹{amount} ಹೊಸ ಸಾಲ',
    dues: '₹{amount} ಬಾಕಿ ({n} ಗ್ರಾಹಕರು)',
    best_day: 'ಅತ್ಯುತ್ತಮ ದಿನ {day}',
    top_item: 'ಹೆಚ್ಚು ಮಾರಾಟವಾದದ್ದು {item}',
    quiet: 'ಈ ವಾರ ಯಾವುದೇ ಮಾರಾಟ ಅಥವಾ ವಸೂಲಿ ದಾಖಲಾಗಿಲ್ಲ. ಮುಂದಿನ ಗ್ರಾಹಕ ಖರೀದಿಸಿದಾಗ ಒಂದು ನಮೂದನ್ನು ಸೇರಿಸಿ.',
    stop: '.',
  },
  ml: {
    header: 'ഈ ആഴ്ച നിങ്ങളുടെ കടയിൽ',
    collected: '₹{amount} പിരിഞ്ഞു കിട്ടി',
    udhaar: '₹{amount} പുതിയ കടം',
    dues: '₹{amount} ബാക്കി ({n} ഉപഭോക്താക്കൾ)',
    best_day: 'മികച്ച ദിവസം {day}',
    top_item: 'ഏറ്റവും കൂടുതൽ വിറ്റത് {item}',
    quiet: 'ഈ ആഴ്ച വിൽപ്പനയോ പിരിവോ രേഖപ്പെടുത്തിയിട്ടില്ല. അടുത്ത ഉപഭോക്താവ് വാങ്ങുമ്പോൾ ഒരു എൻട്രി ചേർക്കുക.',
    stop: '.',
  },
  ur: {
    header: 'اس ہفتے آپ کی دکان پر',
    collected: '₹{amount} وصول ہوئے',
    udhaar: '₹{amount} نیا ادھار',
    dues: '₹{amount} باقی ({n} گاہک)',
    best_day: 'سب سے اچھا دن {day}',
    top_item: 'سب سے زیادہ بکا {item}',
    quiet: 'اس ہفتے کوئی فروخت یا وصولی درج نہیں ہوئی۔ اگلے گاہک کی خریداری پر ایک اندراج شامل کریں۔',
    stop: '۔',
  },
});

// Coerce a possibly-bigint/string DB value to a finite JS number (0 on garbage).
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Normalise a language code to one we have templates for, honouring the
// owner → hi → en fallback chain.
function resolveLang(lang) {
  const l = String(lang || '').trim().toLowerCase();
  if (T[l]) return l;
  for (const f of FALLBACK_ORDER) if (T[f]) return f;
  return 'en';
}

// Integer paise → an Indian-grouped rupee STRING (no ₹ — the template carries the
// symbol). Whole rupees have no decimals; otherwise two places. Uses the exact
// integer sum, so the amount shown is Σ from transactions with no rounding drift.
function fmtINR(paise) {
  const p = Math.round(num(paise));
  const rupees = p / 100;
  if (Number.isInteger(rupees)) return rupees.toLocaleString('en-IN');
  return rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fill(tpl, vars) {
  return String(tpl).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}

// buildWeeklySummary(shopData, lang) → the structured weekly summary + a localized
// one-line WhatsApp `message`.
//
// `shopData` (all shop-scoped, all integer paise unless a count/index/name) is:
//   collected_paise      Σ cash+upi collected over the last 7 days
//   new_udhaar_paise     Σ purchases (new credit) over the last 7 days
//   dues_count           # active customers still owing (balance > 0)
//   dues_total_paise     Σ of those customers' balances
//   top_item             best-selling item name over the window, or null
//   busy_day_dow         busiest weekday index (0=Sun..6=Sat), or null
//
// Returns:
//   { lang, collected_paise, new_udhaar_paise, dues_count, dues_total_paise,
//     top_item, busy_day_dow, quiet, message }
// A "quiet week" (no collections, no new udhaar, no dues) yields a sensible
// gentle message rather than an empty string.
function buildWeeklySummary(shopData = {}, lang) {
  const code = resolveLang(lang);
  const t = T[code];
  const days = DAYS[code] || DAYS.en;

  const collected = num(shopData.collected_paise);
  const newUdhaar = num(shopData.new_udhaar_paise);
  const duesCount = Math.max(0, Math.round(num(shopData.dues_count)));
  const duesTotal = num(shopData.dues_total_paise);
  const topItem = shopData.top_item && String(shopData.top_item).trim() ? String(shopData.top_item).trim() : null;
  const dowRaw = shopData.busy_day_dow;
  const busyDow = Number.isFinite(Number(dowRaw)) && Number(dowRaw) >= 0 && Number(dowRaw) <= 6
    ? Number(dowRaw)
    : null;

  const quiet = collected === 0 && newUdhaar === 0 && duesCount === 0;

  let message;
  if (quiet) {
    message = t.quiet;
  } else {
    const parts = [];
    if (collected > 0) parts.push(fill(t.collected, { amount: fmtINR(collected) }));
    if (newUdhaar > 0) parts.push(fill(t.udhaar, { amount: fmtINR(newUdhaar) }));
    if (duesCount > 0) parts.push(fill(t.dues, { amount: fmtINR(duesTotal), n: duesCount }));
    if (busyDow != null) parts.push(fill(t.best_day, { day: days[busyDow] }));
    if (topItem) parts.push(fill(t.top_item, { item: topItem }));
    message = `${t.header}: ${parts.join(' · ')}${t.stop}`;
  }

  return {
    lang: code,
    collected_paise: collected,
    new_udhaar_paise: newUdhaar,
    dues_count: duesCount,
    dues_total_paise: duesTotal,
    top_item: topItem,
    busy_day_dow: busyDow,
    quiet,
    message,
  };
}

module.exports = { buildWeeklySummary, resolveLang, fmtINR, LANGS, DAYS };
