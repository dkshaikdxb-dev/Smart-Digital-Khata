// CUSTOMER-facing copy for every order status message (batch B).
//
// Until now order.controller.updateStatus built ONE hardcoded English line —
// "your order at X is now accepted" — for every transition. That line told the
// customer nothing they could act on ("accepted" — so when do I come?) and it
// was English no matter who read it. This file REPLACES it: every customer
// message the status path sends is composed here, including the two new ones
// this batch introduces (accepted WITH a ready time, and "need more time").
//
// It is the customer-side mirror of utils/order-alert-copy.js (batch
// ORDERALERT, owner-side) and follows the same conventions deliberately, so the
// two read as one system.
//
// HONESTY CONVENTION (the same one the rest of this repo follows — see
// utils/order-alert-copy.js, utils/weekly-summary.js and the "en/hi authored,
// the rest fall back" note in admin-dashboard/src/lib/i18n.js): only the
// languages a human actually authored are listed. en and hi are authored here.
// Every other language resolves through en rather than being machine-translated
// into text nobody has read — a wrong time in a language the author cannot
// check is worse than English.
//
// THE CLOCK TIME IS THE POINT. The accepted message carries "ready by 4:45 PM",
// never "in 30 minutes". A WhatsApp message is read minutes or hours after it
// lands: a relative phrase rots on the way, an absolute clock time does not.
// The time is rendered in the SHOP's timezone (utils/shopOpen.shopTimezone(),
// `process.env.TZ || 'Asia/Kolkata'`) — the customer and the shop are in the
// same town, and the resolution lives in ONE place for the whole app.
//
// t(lang, key, vars) and buildCustomerMessage() are pure: no I/O, no DB, and
// the clock is always passed in — so the composed message is unit-testable.

const { shopTimezone } = require('./shopOpen');

const LANGS = ['en', 'hi'];
const FALLBACK = 'en';

const T = Object.freeze({
  en: {
    // The one tap that started this batch. `time` is always a clock time.
    accepted_with_time: 'Hi {name}, {shop} has accepted your order. It should be ready by {time}.',
    // The honest version for an owner who genuinely cannot say when.
    accepted_no_time: 'Hi {name}, {shop} has accepted your order. They will tell you when it is ready.',
    // "Need more time" — the promise was re-made, so the message says so plainly
    // instead of quietly sending a second, contradictory "ready by".
    eta_updated: 'Hi {name}, {shop} needs a little longer with your order. It should now be ready by {time}.',
    // The plain status lines that used to be one hardcoded English sentence.
    preparing: 'Hi {name}, {shop} has started preparing your order.',
    ready: 'Hi {name}, your order at {shop} is ready.',
    out_for_delivery: 'Hi {name}, your order from {shop} is on its way to you.',
    completed: 'Hi {name}, your order at {shop} is complete. Thank you!',
    cancelled: 'Hi {name}, your order at {shop} has been cancelled.',
    // Last resort for a status this file has no line for, so a future pipeline
    // stage degrades to a sentence rather than to silence.
    status_generic: 'Hi {name}, your order at {shop} is now {status}.',

    // --- THE SHOP REDUCED THE ORDER (batch C) ------------------------------
    // The customer must NEVER just find a smaller number with no explanation.
    // The message is built as: why → which lines → the new total → what happened
    // to the money, in that order, because that is the order the questions come.
    edit_intro: 'Hi {name}, {shop} could not supply everything you ordered, so your order has been reduced.',
    edit_line_removed: '• {item} — removed',
    edit_line_reduced: '• {item} — {before} → {after}',
    edit_totals: 'New total: {total} (was {was}).',
    // credit — the khata entry that raised the balance is compensated, so what
    // is owed goes down by exactly the difference.
    edit_money_credit: '{amount} has been taken off your khata at {shop}.',
    // prepaid — the customer has already paid. There is no refund pipeline and
    // none is invented: the difference is kept as credit AT THIS SHOP, said in
    // plain words so nobody is left waiting for money back that is not coming.
    edit_money_prepaid: 'You had already paid {was}. The difference of {amount} is kept as credit at {shop} — it comes off your next order there.',
    // cash — nothing was ever posted anywhere; only what to hand over changes.
    edit_money_cash: 'Please pay {total} instead of {was} when you collect your order.',
    // The delivery fee is recomputed by the shop's own rule, so a reduction can
    // move it. Appended only when it actually changed, never as boilerplate.
    edit_fee_changed: 'Delivery fee is now {fee} (was {was_fee}).',
  },
  hi: {
    accepted_with_time: 'नमस्ते {name}, {shop} ने आपका ऑर्डर स्वीकार कर लिया है। यह {time} बजे तक तैयार हो जाना चाहिए।',
    accepted_no_time: 'नमस्ते {name}, {shop} ने आपका ऑर्डर स्वीकार कर लिया है। तैयार होते ही आपको बता दिया जाएगा।',
    eta_updated: 'नमस्ते {name}, {shop} को आपके ऑर्डर में थोड़ा और समय लगेगा। अब यह {time} बजे तक तैयार होना चाहिए।',
    preparing: 'नमस्ते {name}, {shop} ने आपका ऑर्डर तैयार करना शुरू कर दिया है।',
    ready: 'नमस्ते {name}, {shop} पर आपका ऑर्डर तैयार है।',
    out_for_delivery: 'नमस्ते {name}, {shop} से आपका ऑर्डर आपके पास आ रहा है।',
    completed: 'नमस्ते {name}, {shop} पर आपका ऑर्डर पूरा हो गया। धन्यवाद!',
    cancelled: 'नमस्ते {name}, {shop} पर आपका ऑर्डर रद्द कर दिया गया है।',
    status_generic: 'नमस्ते {name}, {shop} पर आपके ऑर्डर की स्थिति अब {status} है।',

    edit_intro: 'नमस्ते {name}, {shop} पर आपके ऑर्डर का पूरा सामान उपलब्ध नहीं था, इसलिए ऑर्डर कम कर दिया गया है।',
    edit_line_removed: '• {item} — हटा दिया गया',
    edit_line_reduced: '• {item} — {before} → {after}',
    edit_totals: 'नया कुल: {total} (पहले {was})।',
    edit_money_credit: 'आपके खाते में से {amount} कम कर दिए गए हैं ({shop})।',
    edit_money_prepaid: 'आपने {was} पहले ही चुका दिए थे। बचे हुए {amount} {shop} पर आपके जमा (क्रेडिट) के रूप में रखे गए हैं — अगली बार के ऑर्डर में कम हो जाएंगे।',
    edit_money_cash: 'सामान लेते समय {was} की जगह {total} दीजिए।',
    edit_fee_changed: 'डिलीवरी शुल्क अब {fee} है (पहले {was_fee})।',
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

// t(lang, key, vars) — the authored string for `lang`, else the English one,
// else the raw key (so a typo shows up loudly instead of rendering blank).
function t(lang, key, vars) {
  const l = resolveLang(lang);
  const s = (T[l] && T[l][key] != null) ? T[l][key] : (T[FALLBACK][key] != null ? T[FALLBACK][key] : key);
  return interpolate(s, vars);
}

/**
 * A promised instant as a CLOCK TIME in the shop timezone, e.g. "4:45 PM".
 *
 * Rendered with the en-IN locale on purpose, in Latin digits, whatever the
 * message language: a time is the one part of the sentence that must survive
 * being read by anyone in the household, and Devanagari digits on a feature
 * phone are a real misreading risk. The WORDS around it are localized; the
 * clock face is not.
 *
 * Returns '' for anything unparseable, so a caller falls back to the
 * no-time wording rather than printing "Invalid Date" to a customer.
 */
function formatClock(at) {
  const d = at instanceof Date ? at : new Date(at);
  if (!d || Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: shopTimezone(),
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch (_e) {
    return '';
  }
}

/**
 * The full customer message for one order event. PURE — every fact, including
 * the promised instant, is passed in.
 *
 *   status       the status the order has JUST moved to ('accepted', 'ready', …)
 *   promisedAt   the promise as an absolute instant (Date/ISO), or null
 *   updated      true for the "need more time" re-promise, which is not a status
 *                change at all and therefore has its own line
 *
 * An 'accepted' order with no promise gets the honest no-time wording; it is
 * never given an invented time.
 */
function buildCustomerMessage({ lang, customerName, shopName, status, promisedAt, updated }) {
  const l = resolveLang(lang);
  const vars = { name: customerName, shop: shopName, status };
  const time = promisedAt ? formatClock(promisedAt) : '';

  if (updated) {
    // A re-promise with no readable time is not worth sending as an "updated
    // time" line; fall back to the plain accepted wording.
    return time ? t(l, 'eta_updated', { ...vars, time }) : t(l, 'accepted_no_time', vars);
  }
  if (status === 'accepted') {
    return time ? t(l, 'accepted_with_time', { ...vars, time }) : t(l, 'accepted_no_time', vars);
  }
  if (T[FALLBACK][status]) return t(l, status, vars);
  return t(l, 'status_generic', vars);
}

/**
 * Integer paise as rupees, e.g. 12500 -> "₹125.00".
 *
 * Latin digits and the en-IN grouping, in every language, for the same reason
 * formatClock() renders a Latin clock face: the AMOUNT is the part of a money
 * message that must survive being read by anyone in the household, and a
 * misread total is the one mistake this batch exists to avoid.
 */
function rupees(paise) {
  const n = Number(paise);
  if (!Number.isFinite(n)) return '';
  return `₹${(n / 100).toFixed(2)}`;
}

/**
 * The message a customer gets when the SHOP reduced their order (batch C).
 * PURE — every fact is passed in.
 *
 *   paymentMode   'credit' | 'prepaid' | 'cash'
 *   changes       [{ name, qty_before, qty_after }] — the lines that changed
 *   oldTotal      subtotal + delivery fee BEFORE this edit (paise)
 *   newTotal      subtotal + delivery fee AFTER  this edit (paise)
 *   reduction     oldTotal - newTotal (paise). May be <= 0 only in the rare case
 *                 where a reduction pushed the order back under the shop's
 *                 free-delivery threshold and the fee returned; the money lines
 *                 are then omitted rather than stating a refund that is not one.
 *   oldFee/newFee the delivery fee before/after — mentioned only when it moved.
 *
 * Never says "refund": nothing in this app refunds money, and telling a customer
 * otherwise would be the one lie this whole batch is built to avoid.
 */
function buildOrderEditMessage({
  lang, customerName, shopName, paymentMode,
  changes, oldTotal, newTotal, reduction, oldFee, newFee,
}) {
  const l = resolveLang(lang);
  const vars = { name: customerName, shop: shopName };
  const parts = [t(l, 'edit_intro', vars)];

  for (const c of changes || []) {
    parts.push(Number(c.qty_after) === 0
      ? t(l, 'edit_line_removed', { item: c.name })
      : t(l, 'edit_line_reduced', { item: c.name, before: c.qty_before, after: c.qty_after }));
  }

  if (oldFee != null && newFee != null && Number(oldFee) !== Number(newFee)) {
    parts.push(t(l, 'edit_fee_changed', { fee: rupees(newFee), was_fee: rupees(oldFee) }));
  }

  parts.push(t(l, 'edit_totals', { total: rupees(newTotal), was: rupees(oldTotal) }));

  const diff = Number(reduction);
  if (Number.isFinite(diff) && diff > 0) {
    if (paymentMode === 'credit') {
      parts.push(t(l, 'edit_money_credit', { ...vars, amount: rupees(diff) }));
    } else if (paymentMode === 'prepaid') {
      parts.push(t(l, 'edit_money_prepaid', { ...vars, amount: rupees(diff), was: rupees(oldTotal) }));
    } else if (paymentMode === 'cash') {
      parts.push(t(l, 'edit_money_cash', { total: rupees(newTotal), was: rupees(oldTotal) }));
    }
  }

  return parts.join('\n');
}

module.exports = {
  LANGS,
  FALLBACK,
  resolveLang,
  t,
  formatClock,
  rupees,
  buildCustomerMessage,
  buildOrderEditMessage,
};
