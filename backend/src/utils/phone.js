/**
 * Normalize a phone number to E.164.
 * - "9876543210"     → "+919876543210"   (assume India)
 * - "+919876543210"  → "+919876543210"
 * - "919876543210"   → "+919876543210"
 * - already-international (+44…)         left as-is
 */
function toE164(phone, defaultCountryCode = '91') {
  if (!phone) return phone;
  const trimmed = String(phone).replace(/[\s\-()]/g, '');
  if (trimmed.startsWith('+')) return trimmed;
  if (trimmed.length === 10) return `+${defaultCountryCode}${trimmed}`;
  if (trimmed.startsWith(defaultCountryCode) && trimmed.length === 10 + defaultCountryCode.length) {
    return `+${trimmed}`;
  }
  return `+${trimmed}`;
}

/** Strip the leading "+" — Meta's WhatsApp API wants no plus. */
function toWaFormat(phone) {
  const e164 = toE164(phone);
  return e164.startsWith('+') ? e164.slice(1) : e164;
}

module.exports = { toE164, toWaFormat };
