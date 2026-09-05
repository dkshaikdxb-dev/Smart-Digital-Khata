import { useLang } from '../lib/i18n';

// Shared, meaning-colored balance renderer for the low-literacy owner audience.
// It shows the EXACT ₹ figure (same `₹${(p/100).toFixed(2)}` used everywhere —
// no math is changed here) and ADDS a color + a one-word in-language label so the
// meaning reads at a glance:
//   balance > 0 → the customer owes the shop → RED  + t('bal.owed')
//   balance < 0 → the customer has credit     → GREEN + t('bal.advance')
//   balance = 0 → nothing due                 → muted + t('bal.settled')
// The word carries the meaning too, so it is NOT color-only (accessible, and
// safe on greyscale / for colour-blind owners). tabular-nums keeps figures aligned.
// RTL-safe: it is plain inline flow, so Urdu lays out right-to-left naturally.
const fmtPaise = (p) => `₹${(Number(p || 0) / 100).toFixed(2)}`;

export default function Balance({ paise, showWord = true, className, style, wordClassName }) {
  const { t } = useLang();
  const n = Number(paise || 0);
  let color;
  let word;
  if (n > 0) { color = 'var(--danger)'; word = t('bal.owed'); }
  else if (n < 0) { color = 'var(--accent)'; word = t('bal.advance'); }
  else { color = 'var(--muted)'; word = t('bal.settled'); }
  return (
    <span className={className} style={{ color, fontVariantNumeric: 'tabular-nums', ...style }}>
      <span>{fmtPaise(n)}</span>
      {showWord && <span className={wordClassName || 'bal-word'}> · {word}</span>}
    </span>
  );
}
