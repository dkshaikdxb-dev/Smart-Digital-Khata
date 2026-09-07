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
