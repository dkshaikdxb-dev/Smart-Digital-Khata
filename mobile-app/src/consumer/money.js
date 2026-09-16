// Money is INTEGER PAISE everywhere it comes from / goes to the API. These two
// helpers are the only place rupees and paise convert, so the app never drifts.

// Format integer paise as a rupee string, e.g. 12345 -> "₹123.45".
export function money(paise) {
  const p = Number(paise || 0);
  return `₹${(p / 100).toFixed(2)}`;
}

// Convert a rupee amount typed by a user into integer paise, e.g. 123.4 -> 12340.
// Guards against NaN/negative so a bad input becomes 0 rather than corrupt money.
export function toPaise(rupees) {
  const n = Number(rupees);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

// The same amount, said out loud rather than shown.
//
// A screen reads "₹1,23,456.00". A speech engine reads that back as a LIST of
// numbers — "one, twenty-three, four hundred and fifty-six" — because the
// grouping commas break it up and the symbol is not a word it says. So the
// spoken form drops the symbol and the grouping, and drops ".00" when there is
// no paise, since "one lakh twenty-three thousand four hundred fifty-six point
// zero zero" is not how anyone says a balance. The word "rupees" comes from the
// dictionary in the shopper's own language, not from here.
//
// Mirrors admin-dashboard/src/lib/money.js's spokenRupees, which is what the
// web consumer khata already speaks.
export function spokenRupees(paise) {
  const n = Math.abs(Number(paise || 0));
  const rupees = Math.floor(n / 100);
  const p = n % 100;
  return p === 0 ? String(rupees) : `${rupees}.${String(p).padStart(2, '0')}`;
}

// What a balance SOUNDS like.
//
// The web speaks "Balance of {name} is {amount} rupees", and porting that
// sentence unchanged would have carried a money-meaning bug into the app. A
// balance here has a DIRECTION: positive is money the shopper owes the shop,
// negative is an advance sitting in their favour. "Balance is 125 rupees" is
// the same sentence for both, and the one person who most needs this feature —
// someone who cannot read the screen — is exactly the person who does not get
// the green "In advance" label that disambiguates it. Being told you owe money
// you have actually paid in advance is not a rounding error.
//
// So the spoken form READS THE ROW: the shop, then the row's own word for which
// way the money goes, then the amount. Those three words (khata.owe /
// khata.advance / khata.settled) are the ones already on screen and already
// translated in every language, so nothing is invented here — and a settled
// shop says only that it is settled, because "All settled 0 rupees" is not a
// thing anyone says.
export function spokenBalance(t, s) {
  const bal = Number(s.balance);
  const word = bal > 0 ? t('khata.owe') : bal < 0 ? t('khata.advance') : t('khata.settled');
  if (bal === 0) return `${s.shop_name}. ${word}`;
  // Ungrouped and symbol-free: see money.spokenRupees.
  return `${s.shop_name}. ${word} ${spokenRupees(bal)} ${t('voice.rupees')}`;
}
