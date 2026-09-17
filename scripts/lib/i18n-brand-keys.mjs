// What stays in English, and why — in TWO sets, because there are two kinds.
//
// BRAND_KEYS: the WHOLE value is English.
//
//   - the product's own name, which does not change per language;
//   - a field label that must match, word for word, what the shopkeeper is
//     looking at in somebody else's dashboard. "Razorpay Key ID" is what
//     Razorpay calls it; translating it means the person hunting for that value
//     is now looking for a phrase that appears nowhere on their screen.
//
// BRAND_TERMS: an English term PROTECTED INSIDE a translated sentence.
//
//   "Key Secret નથી" is a Gujarati sentence with an English proper noun in it.
//   The old single set was written for bare labels only, so the four sentence
//   keys that carry the same terms were governed by decisions the gates could
//   not see — and that is exactly where six rows drifted into web/app conflict
//   before anything noticed. See scripts/i18n-decisions.json > brand-registry-split.
//
//   This is a CASING check, not a translation requirement: if a value contains a
//   protected term, it must spell it exactly this way. A language that has not
//   adopted the Latin term is NOT failed by it — ta, te, kn, ml and ur still
//   transliterate these, which is an open question and not a defect.
//
// ONE place, imported by every gate that asks "is this row still English?".
// The script-integrity gate, the web translation verifier and the registry gate
// all need it, and this codebase has been bitten seven times by a second copy of
// a list drifting from the first. Not an eighth.
export const BRAND_KEYS = new Set([
  'app.name', 'app.shortName', 'title.dashboard',
  'set.razorpayKeyId', 'set.keySecret', 'set.webhookSecret',
]);

export const BRAND_TERMS = [
  'Razorpay Key ID', 'Key Secret', 'Webhook Secret', 'WhatsApp', 'UPI',
];

// Longest first, so "Razorpay Key ID" is matched before "Key Secret" could ever
// claim part of it, and a value containing both is reported once per term.
const TERMS_BY_LENGTH = [...BRAND_TERMS].sort((a, b) => b.length - a.length);

/**
 * Every protected term this value spells with the wrong casing.
 * Returns [] for a value that does not mention the term at all.
 */
export function brandTermCasingErrors(value) {
  const s = String(value ?? '');
  const out = [];
  for (const term of TERMS_BY_LENGTH) {
    const ci = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    for (const m of s.matchAll(ci)) if (m[0] !== term) out.push({ term, found: m[0] });
  }
  return out;
}

export default BRAND_KEYS;
