// Warm, high-contrast, large-tap-target theme for the consumer app. Reuses the
// app's khata-green accent (#22c55e / #1C7A45) on a dark base (#0f172a) that
// matches the owner flavor, so both apps feel like one family.
export const colors = {
  bg: '#0f172a',
  card: '#1e293b',
  cardAlt: '#0b1220',
  border: '#334155',
  text: '#f1f5f9',
  textMuted: '#94a3b8',
  accent: '#22c55e',
  accentDark: '#1C7A45',
  onAccent: '#052e16',
  danger: '#ef4444',
  warn: '#f59e0b',
  ok: '#22c55e',
};

// Shared sizing tokens — deliberately generous for low-literacy, older, and
// low-vision users (min 48px tap targets, large legible type).
export const sizes = {
  tap: 52,
  radius: 14,
  gap: 12,
  pad: 16,
  title: 22,
  body: 16,
  big: 30,
};
