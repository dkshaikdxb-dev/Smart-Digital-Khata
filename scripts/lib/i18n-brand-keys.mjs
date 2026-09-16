// Keys whose value is correct BECAUSE it is in English.
//
// Two kinds, and neither is an untranslated string:
//
//   - the product's own name, which does not change per language;
//   - a field label that must match, word for word, what the shopkeeper is
//     looking at in somebody else's dashboard. "Razorpay Key ID" is what
//     Razorpay calls it; translating it means the person hunting for that value
//     is now looking for a phrase that appears nowhere on their screen.
//
// ONE list, imported by every gate that asks "is this row still English?".
// The script-integrity gate and the web translation verifier both need it, and
// this codebase has been bitten six times by a second copy of a list drifting
// from the first — a language gate, a capability flag, a promo-language picker.
// Not a seventh.
export const BRAND_KEYS = new Set([
  'app.name', 'app.shortName', 'title.dashboard',
  'set.razorpayKeyId', 'set.keySecret', 'set.webhookSecret',
]);

export default BRAND_KEYS;
