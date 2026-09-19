// The platform accent, and which festive window is currently painting it.
//
// One value, resolved here so nothing else has to. The clients ask
// /public/config and get a colour; they do no date arithmetic and hold no
// schedule, which also means a phone with a wrong clock cannot pick the wrong
// theme. Falls back at every step — a missing table, an unreachable database or
// a malformed value all land on the colour the clients already ship.
const { query } = require('../config/db');
const {
  DEFAULT_ACCENT, ON_ACCENT, APP_BG,
  normalizeHex, luminance, contrastRatio, contrastReport,
} = require('./contrast');

/** The standing accent from platform_settings, or the built-in default. */
async function defaultAccent() {
  try {
    const r = await query(`SELECT value FROM platform_settings WHERE key = 'theme_accent'`);
    return normalizeHex(r.rows[0] && r.rows[0].value) || DEFAULT_ACCENT;
  } catch (_e) {
    return DEFAULT_ACCENT;
  }
}

/**
 * The accent to paint right now.
 *
 * Same rule referral campaigns use: active, inside its window, highest priority
 * wins — with the row's own id as the last tiebreak so two equal-priority
 * windows resolve the same way on every request rather than flickering between
 * them. A NULL date is an open end.
 */
async function resolveAccent() {
  const fallback = await defaultAccent();
  try {
    const r = await query(
      `SELECT name, accent
         FROM theme_campaigns
        WHERE status = 'active'
          AND (starts_at IS NULL OR starts_at <= NOW())
          AND (ends_at   IS NULL OR ends_at   >= NOW())
        ORDER BY priority DESC, created_at DESC, id
        LIMIT 1`
    );
    const row = r.rows[0];
    const hex = row && normalizeHex(row.accent);
    if (hex) return { accent: hex, source: 'campaign', campaign: row.name };
  } catch (_e) {
    // No table yet, or the database is unreachable: the standing accent still stands.
  }
  return { accent: fallback, source: 'default', campaign: null };
}

module.exports = {
  DEFAULT_ACCENT, ON_ACCENT, APP_BG,
  normalizeHex, luminance, contrastRatio, contrastReport,   // re-exported from ./contrast
  defaultAccent, resolveAccent,
};
