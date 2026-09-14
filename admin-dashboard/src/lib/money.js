// The ONE money formatter for the owner console and the consumer PWA.
//
// Money is integer paise everywhere — in the database, over the API, and into
// this module. Nothing here ever divides paise by 100: the rupee part and the
// paise part are split with integer arithmetic and re-joined as text, so a
// balance of 14,49,999.99 can never come back as 14,49,999.98999999.
//
// Grouping is Indian: ₹1,23,456 is how a shopkeeper in Sitapur reads a lakh.
// ₹123,456 is a different number to them, and the dashboard used to show it on
// most screens because five separate formatters had grown up side by side —
// `(p/100).toFixed(2)` in twenty-odd files, two Intl instances with different
// options, and two that rounded to whole rupees. They are all this function now.
//
// The presets below are the only vocabulary call sites need; they exist so a
// screen picks an INTENT ("a balance", "a KPI tile", "a number inside a
// sentence") instead of re-deciding grouping and decimals each time.

const RUPEE = '₹';

// One formatter instance, reused: constructing an Intl.NumberFormat per render
// is measurably slow on the cheap Androids this app is built for. It is given
// an INTEGER number of rupees, never a fraction, so it only ever groups.
const GROUP_IN = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0, useGrouping: true });
const PLAIN_IN = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0, useGrouping: false });

/**
 * Split integer paise into { negative, rupees, paise } using integer maths.
 * `(abs - part) / 100` is an exact division of a multiple of 100, so no value a
 * shop will ever hold loses its last paisa here.
 */
function split(value) {
  let n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) n = 0;
  // The API contract is integer paise; a fractional paisa would be a bug
  // upstream, and rounding it is still better than rendering "₹12.3.5".
  n = Math.round(n);
  const negative = n < 0;
  const abs = Math.abs(n);
  const paise = abs % 100;
  return { negative, rupees: (abs - paise) / 100, paise };
}

/**
 * formatPaise(paise, options)
 *
 *   symbol    true   prefix ₹
 *   decimals  'always' | 'auto' | 'none'
 *                    'auto' drops ".00" on a whole rupee (used inside sentences
 *                    and by the read-aloud templates)
 *                    'none' rounds to the nearest whole rupee (KPI tiles)
 *   absolute  false  drop the sign — for call sites that render the meaning in
 *                    words instead ("₹50 · advance"), where a "-" only confuses
 *   group     true   Indian digit grouping; false for text a screen reader will
 *                    speak, because a voice reads the commas out
 */
export function formatPaise(value, options = {}) {
  const {
    symbol = true, decimals = 'always', absolute = false, group = true,
  } = options;

  const { negative, rupees, paise } = split(value);
  const nf = group ? GROUP_IN : PLAIN_IN;

  let whole = rupees;
  let fraction = '';
  if (decimals === 'none') {
    if (paise >= 50) whole += 1;
  } else if (decimals === 'auto') {
    if (paise !== 0) fraction = `.${String(paise).padStart(2, '0')}`;
  } else {
    fraction = `.${String(paise).padStart(2, '0')}`;
  }

  const isZero = whole === 0 && paise === 0;
  const sign = negative && !absolute && !isZero ? '-' : '';
  return `${sign}${symbol ? RUPEE : ''}${nf.format(whole)}${fraction}`;
}

/** ₹1,23,456.00 — the default for a ledger figure, a price, an order total. */
export const money = (paise) => formatPaise(paise);

/** ₹1,23,456.00 with no sign — for a figure whose direction is stated in words. */
export const moneyAbs = (paise) => formatPaise(paise, { absolute: true });

/** ₹1,23,456 / ₹1,23,456.50 — a whole rupee reads without the trailing ".00". */
export const moneyAuto = (paise) => formatPaise(paise, { decimals: 'auto' });

/** ₹1,23,456 — whole rupees, for a headline KPI where paise are noise. */
export const moneyRounded = (paise) => formatPaise(paise, { decimals: 'none' });

/** 1,23,456 — the grouped number alone, for a sentence that carries its own ₹. */
export const rupeesNumber = (paise) => formatPaise(paise, { symbol: false, decimals: 'auto' });

/** 123456.50 — ungrouped, for text-to-speech: a voice reads commas aloud. */
export const spokenRupees = (paise) => formatPaise(paise, { symbol: false, decimals: 'auto', group: false });

/** Rupees as an editable input value ("45.5"), for the price boxes. */
export const rupeesInput = (paise) => {
  const { negative, rupees, paise: p } = split(paise);
  const sign = negative ? '-' : '';
  if (p === 0) return `${sign}${rupees}`;
  const trimmed = String(p).padStart(2, '0').replace(/0$/, '');
  return `${sign}${rupees}.${trimmed}`;
};
