const settings = require('../config/settings');

// Public, unauthenticated runtime config for the marketing landing. Only
// safe-to-expose values live here. The landing reads this on load and falls back
// to its built-in default if the value is unset or the request fails, so the
// page never breaks. `landing_whatsapp` is the shop's public "chat with us"
// WhatsApp number in international digits (no +), editable from Admin → Settings.
exports.publicConfig = async (_req, res) => {
  const raw = settings.get('LANDING_WHATSAPP');
  const digits = raw ? String(raw).replace(/\D/g, '') : '';
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json({ landing_whatsapp: digits || null });
};
