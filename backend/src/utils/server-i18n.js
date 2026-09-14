// The server's ONE override-backed translator.
//
// The web app resolves a string as: live override → built-in text → English.
// The overrides come from the `i18n_overrides` table, which is also where the
// 852-strings-per-language regional seed lands (src/data/regional-i18n.json,
// loaded by utils/import-i18n-overrides). This module gives the SERVER the same
// resolution over the same table, so a WhatsApp message a customer receives and
// the screen they open from it are corrected by the same edit.
//
// Why it exists: the customer purchase / payment / reminder messages in
// services/notification.service were English string literals. A shopper who had
// set the app to Tamil still got "Hi Kumar, this is Ganesh Stores. Purchase
// recorded: ₹240.00." There are already three hand-written per-language tables
// in this repo (order-alert-copy, order-customer-copy, weekly-summary); adding a
// fourth would have been a fourth thing to keep in step. This reads the
// translations the humans already maintain instead.
//
// English lives HERE, in EN, and is the source of truth: every other language is
// an override row keyed by the same key. A key with no override renders its
// English text — never a blank, never a raw key name.

const { query } = require('../config/db');
const { normalizeLangCode } = require('./language-registry');

// English source of truth for the messages this module owns. `wa.*` = the
// WhatsApp copy the server composes and sends.
//
// The MONEY is interpolated already formatted (₹ and all) by the caller, for the
// same reason utils/order-customer-copy renders a Latin clock face in every
// language: the amount is the part of the sentence that has to survive being
// read aloud by whoever in the household can read, and a misread total is the
// one mistake worth engineering against. The WORDS are localized; the figure is
// not.
const EN = Object.freeze({
  // A purchase recorded on the khata.
  'wa.tx.purchase.intro': 'Hi {name}, this is {shop}.',
  'wa.tx.purchase.amount': 'Purchase recorded: {amount}.',
  // A shop ADJUSTMENT — the balance drops but the customer handed over nothing,
  // so this deliberately does not say "we received your payment".
  'wa.tx.adjustment': 'Hi {name}, {shop} has adjusted your khata by {amount}.',
  // A payment received.
  'wa.tx.payment': 'Hi {name}, {shop} received your payment of {amount}.',
  // Shared trailing lines.
  'wa.tx.outstanding': 'Outstanding: {amount}.',
  'wa.tx.remaining': 'Remaining: {amount}. Thank you!',
  'wa.tx.note': 'Note: {note}',
  // The dues reminder.
  'wa.reminder.intro': 'Hi {name}, friendly reminder from {shop}.',
  'wa.reminder.body': 'Your outstanding amount is {amount}. Please pay at your convenience.',
});

// Every key this module can render. Exported so a test (and a future admin
// translation screen) can enumerate what needs translating.
const KEYS = Object.freeze(Object.keys(EN));

const FALLBACK = 'en';

// The overrides are read from the DB on demand and cached briefly. A WhatsApp
// send is already an I/O path, but a broadcast to 500 customers must not become
// 500 extra SELECTs. 60s matches the Cache-Control the public overrides endpoint
// serves to the web app, so a correction lands everywhere at the same pace.
const TTL_MS = 60 * 1000;
let cache = { at: 0, data: null };

/**
 * Load (or reuse) the override table as { lang: { key: value } }.
 * A DB failure is NOT fatal: it yields an empty map, and every string then
 * renders in English — degraded, but a message still goes out.
 */
async function loadOverrides({ force = false } = {}) {
  const now = Date.now();
  if (!force && cache.data && now - cache.at < TTL_MS) return cache.data;
  try {
    const r = await query('SELECT lang, key, value FROM i18n_overrides');
    const data = {};
    for (const row of r.rows) {
      if (!data[row.lang]) data[row.lang] = {};
      data[row.lang][row.key] = row.value;
    }
    cache = { at: now, data };
  } catch (_e) {
    cache = { at: now, data: cache.data || {} };
  }
  return cache.data;
}

// Drop the cache — for tests, and for any caller that has just written an
// override and wants it live immediately.
function resetCache() {
  cache = { at: 0, data: null };
}

function interpolate(str, vars) {
  if (!vars) return String(str);
  return String(str).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}

/**
 * A translator bound to one language. Async because it may have to read the
 * override table; the returned `t` is synchronous, so a caller composing five
 * lines does one await, not five.
 *
 *   const t = await translator(customerLang);
 *   t('wa.tx.payment', { name, shop, amount });
 *
 * Resolution per key: override for this language → English source → the raw key
 * (which would be a bug, and is meant to look like one).
 */
async function translator(lang) {
  const code = normalizeLangCode(lang) || FALLBACK;
  const overrides = await loadOverrides();
  const forLang = (code !== FALLBACK && overrides[code]) || {};
  return function t(key, vars) {
    const raw = forLang[key] != null && String(forLang[key]).trim() !== ''
      ? forLang[key]
      : (EN[key] != null ? EN[key] : key);
    return interpolate(raw, vars);
  };
}

/**
 * Integer paise as a rupee string, e.g. 12500 → "₹125.00". The exact format the
 * customer messages have always used, kept byte-identical so an English reader
 * sees no change at all.
 */
function rupees(paise) {
  const n = Number(paise);
  if (!Number.isFinite(n)) return '₹0.00';
  return `₹${(n / 100).toFixed(2)}`;
}

module.exports = { EN, KEYS, FALLBACK, translator, loadOverrides, resetCache, rupees };
