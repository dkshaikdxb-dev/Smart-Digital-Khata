// Owner-facing copy for the new-order alert and its reminders (batch ORDERALERT).
//
// The first alert used to be English lines built inline in my.controller; both it
// and the WhatsApp REMINDERS now come from here, so the two can never drift apart
// and a shopkeeper who reads Hindi gets Hindi on both.
//
// HONESTY CONVENTION (the same one the rest of this repo follows — see
// utils/weekly-summary.js and the "en/hi authored, the rest fall back" note in
// admin-dashboard/src/lib/i18n.js): only the languages a human actually authored
// are listed. en and hi are authored here. Every other language resolves through
// en rather than being machine-translated into text nobody has read — a wrong
// rupee amount in a language the author cannot check is worse than English.
// Adding a language is one more block below; nothing else changes.
//
// t(lang, key, vars) is pure: no I/O, no clock, no randomness — so the composed
// message is unit-testable without a DB or a network.

const LANGS = ['en', 'hi'];
const FALLBACK = 'en';

const T = Object.freeze({
  en: {
    // First alert, sent the moment the order commits.
    new_header: 'New order at {shop}',
    // Every repeat until the owner acknowledges. It says plainly that it is a
    // reminder, how long the order has been waiting, and which repeat this is —
    // so the owner can tell a genuine second order from a nag.
    reminder_header: 'REMINDER {n}/{max}: an order is still waiting at {shop}',
    waiting: 'Waiting {age}',
    customer: 'Customer: {name}',
    items_total: 'Items: {count} · Total: {total}',
    fulfillment: 'Fulfillment: {mode}',
    payment: 'Payment: {mode}',
    address: 'Address: {address}',
    note: 'Note: {note}',
    // Closing line on a reminder: how to make it stop.
    ack_hint: 'Open Smart Digital Khata and tap Seen (or accept the order) to stop these reminders.',
    delivery: 'Delivery',
    pickup: 'Pickup',
    pay_credit: 'Credit (khata)',
    pay_prepaid: 'Prepaid (online)',
    pay_cash_delivery: 'Cash on delivery',
    pay_cash_pickup: 'Cash on pickup',
    age_minutes: '{n} min',
    age_hours: '{n} hr',
    age_hours_minutes: '{h} hr {m} min',
  },
  hi: {
    new_header: '{shop} पर नया ऑर्डर',
    reminder_header: 'याद दिलाना {n}/{max}: {shop} पर एक ऑर्डर अब भी इंतज़ार कर रहा है',
    waiting: '{age} से इंतज़ार',
    customer: 'ग्राहक: {name}',
    items_total: 'सामान: {count} · कुल: {total}',
    fulfillment: 'डिलीवरी/पिकअप: {mode}',
    payment: 'भुगतान: {mode}',
    address: 'पता: {address}',
    note: 'नोट: {note}',
    ack_hint: 'ये याद दिलाने बंद करने के लिए Smart Digital Khata खोलें और "देख लिया" दबाएँ (या ऑर्डर स्वीकार करें)।',
    delivery: 'डिलीवरी',
    pickup: 'पिकअप',
    pay_credit: 'उधार (खाता)',
    pay_prepaid: 'ऑनलाइन भुगतान',
    pay_cash_delivery: 'डिलीवरी पर नकद',
    pay_cash_pickup: 'पिकअप पर नकद',
    age_minutes: '{n} मिनट',
    age_hours: '{n} घंटे',
    age_hours_minutes: '{h} घंटे {m} मिनट',
  },
});

// Resolve a raw language tag to one of the AUTHORED languages, else English. A
// regional tag like 'hi-IN' resolves on its primary subtag.
function resolveLang(raw) {
  const two = String(raw == null ? '' : raw).trim().toLowerCase().slice(0, 2);
  return T[two] ? two : FALLBACK;
}

function interpolate(str, vars) {
  if (!vars) return str;
  return String(str).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}

// t(lang, key, vars) — the authored string for `lang`, else the English one, else
// the raw key (so a typo shows up loudly instead of rendering blank).
function t(lang, key, vars) {
  const l = resolveLang(lang);
  const s = (T[l] && T[l][key] != null) ? T[l][key] : (T[FALLBACK][key] != null ? T[FALLBACK][key] : key);
  return interpolate(s, vars);
}

/** Human-readable ₹ from integer paise. Money is integer paise everywhere else. */
function rupees(paise) {
  return `₹${(Number(paise) / 100).toFixed(2)}`;
}

/** "12 min" / "2 hr" / "2 hr 5 min", localized. Seconds in, never negative. */
function formatAge(lang, seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const mins = Math.floor(total / 60);
  if (mins < 60) return t(lang, 'age_minutes', { n: mins });
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? t(lang, 'age_hours', { n: h }) : t(lang, 'age_hours_minutes', { h, m });
}

/** The localized fulfillment and payment labels the alert lines quote. */
function fulfillmentLabel(lang, fulfillmentType) {
  return t(lang, fulfillmentType === 'delivery' ? 'delivery' : 'pickup');
}
function paymentLabel(lang, paymentMode, fulfillmentType) {
  if (paymentMode === 'cash') {
    return t(lang, fulfillmentType === 'delivery' ? 'pay_cash_delivery' : 'pay_cash_pickup');
  }
  if (paymentMode === 'prepaid') return t(lang, 'pay_prepaid');
  if (paymentMode === 'credit') return t(lang, 'pay_credit');
  return String(paymentMode || '');
}

/**
 * The full owner alert message. PURE — every fact is passed in, nothing is read
 * from the clock or the DB, so a test can assert the exact text.
 *
 * `repeat` is null/absent for the FIRST alert and
 * `{ n, max, ageSeconds }` for a reminder. A reminder leads with the REMINDER
 * header + how long the order has waited and ends with how to silence it; the
 * order facts in between are identical, so the owner reads the same shape twice.
 */
function buildOwnerAlert({
  lang, shopName, customerName, itemCount, total, fulfillmentType, paymentMode, address, note, repeat,
}) {
  const l = resolveLang(lang);
  const lines = [];
  if (repeat) {
    lines.push(t(l, 'reminder_header', { n: repeat.n, max: repeat.max, shop: shopName }));
    lines.push(t(l, 'waiting', { age: formatAge(l, repeat.ageSeconds) }));
  } else {
    lines.push(t(l, 'new_header', { shop: shopName }));
  }
  lines.push(t(l, 'customer', { name: customerName }));
  lines.push(t(l, 'items_total', { count: itemCount, total: rupees(total) }));
  lines.push(t(l, 'fulfillment', { mode: fulfillmentLabel(l, fulfillmentType) }));
  lines.push(t(l, 'payment', { mode: paymentLabel(l, paymentMode, fulfillmentType) }));
  if (fulfillmentType === 'delivery' && address) lines.push(t(l, 'address', { address }));
  if (note) lines.push(t(l, 'note', { note }));
  if (repeat) lines.push(t(l, 'ack_hint'));
  return lines.join('\n');
}

module.exports = {
  LANGS,
  FALLBACK,
  resolveLang,
  t,
  rupees,
  formatAge,
  fulfillmentLabel,
  paymentLabel,
  buildOwnerAlert,
};
