const settings = require('../config/settings');
const { query } = require('../config/db');

// The owner voice-assistant toggle, read LIVE from platform_settings so a just-
// saved Admin change is honoured on the next load (mirrors utils/referral
// getRewardRule). DEFAULT ON: the flag is only OFF when it is explicitly stored
// as 'false'; a missing row or ANY error → true, so the free/offline assistant
// never disappears because of a transient DB hiccup. Migration 0052 seeds 'true'.
async function getVoiceAssistantEnabled() {
  try {
    const r = await query(
      `SELECT value FROM platform_settings WHERE key = 'voice_assistant_enabled'`
    );
    const v = r.rows[0] && r.rows[0].value;
    return v !== 'false'; // unset / anything-but-'false' → enabled
  } catch (_e) {
    return true; // default ON on any error
  }
}

// Public, unauthenticated runtime config for the marketing landing. Only
// safe-to-expose values live here. The landing reads this on load and falls back
// to its built-in default if the value is unset or the request fails, so the
// page never breaks. `landing_whatsapp` is the shop's public "chat with us"
// WhatsApp number in international digits (no +), editable from Admin → Settings.
// `voice_assistant_enabled` is the platform on/off flag for the owner voice
// "Ask": the owner app loads this endpoint early and hides the mic when false.
exports.publicConfig = async (_req, res) => {
  const raw = settings.get('LANDING_WHATSAPP');
  const digits = raw ? String(raw).replace(/\D/g, '') : '';
  const voiceEnabled = await getVoiceAssistantEnabled();
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json({ landing_whatsapp: digits || null, voice_assistant_enabled: voiceEnabled });
};
