const { query } = require('./db');
const logger = require('../utils/logger');

/**
 * Platform settings with DB storage + .env fallback.
 * Values set via the admin UI live in platform_settings and override .env.
 * Loaded into memory at startup and refreshed on every write.
 */

// Every third-party integration credential/config the admin panel can edit
// (batch INTEG). The setting key IS the env var name, so `.env` keeps working
// as the fallback for each one (ENV_FALLBACK is derived from this list).
// Secrets are never echoed by the API — only `*_set` booleans and key NAMES.
// Kept env-only (deliberately NOT here): DATABASE_URL, REDIS_URL, JWT_SECRET,
// ALLOWED_ORIGINS, ADMIN_EMAIL/PASSWORD, CONTENT_TOKEN_KEY, PORT, LOG_LEVEL,
// rate limits and the *_MAX_TOKENS / *_TIMEOUT_MS tuning knobs.
const INTEGRATION_KEYS = Object.freeze([
  // Razorpay (billing)
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'RAZORPAY_PLAN_PRO',
  'RAZORPAY_PLAN_FAMILY',
  // WhatsApp Cloud API (messaging)
  'WHATSAPP_API_URL',
  'WHATSAPP_API_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_BUSINESS_ACCOUNT_ID',
  'WHATSAPP_TEMPLATE_REMINDER',
  'WHATSAPP_TEMPLATE_LANG',
  // AI (moderation triage + content drafts). Model ids are operator-supplied —
  // never hardcoded anywhere in code.
  'ANTHROPIC_API_KEY',
  'MODERATION_LLM_MODEL',
  'CONTENT_LLM_MODEL',
  // Meta app (Facebook / Instagram publishing)
  'META_APP_ID',
  'META_APP_SECRET',
  'META_PAGE_TOKEN',
  'META_IG_TOKEN',
  // SMTP (newsletters)
  'SMTP_URL',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_SECURE',
  'NEWSLETTER_FROM',
  // Speech & translation (Bhashini / Sarvam). BHASHINI_NMT '1' enables the NMT
  // seam; the provider keys are stored for the (not yet wired) adapter.
  'BHASHINI_NMT',
  'BHASHINI_API_KEY',
  'BHASHINI_USER_ID',
  'SARVAM_API_KEY',
]);

// The subset that is a credential: written only when non-empty, cleared with an
// explicit null, and NEVER returned or logged (only a `*_set` boolean).
const SECRET_KEYS = Object.freeze(new Set([
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'WHATSAPP_API_TOKEN',
  'ANTHROPIC_API_KEY',
  'META_APP_SECRET',
  'META_PAGE_TOKEN',
  'META_IG_TOKEN',
  'SMTP_URL', // may embed a password (smtp://user:pass@host)
  'SMTP_PASS',
  'BHASHINI_API_KEY',
  'SARVAM_API_KEY',
]));

// setting key -> env var used as fallback when the DB value is empty
// (key === env var name for every integration key).
const ENV_FALLBACK = {};
for (const k of INTEGRATION_KEYS) ENV_FALLBACK[k] = k;

let cache = {};
let loaded = false;

async function load() {
  try {
    const r = await query('SELECT key, value FROM platform_settings');
    cache = {};
    for (const row of r.rows) cache[row.key] = row.value;
    loaded = true;
    logger.info({ count: r.rowCount }, 'Platform settings loaded');
  } catch (err) {
    // Table may not exist yet on very first boot before migrations — fall back to env.
    logger.warn({ err: err.message }, 'Could not load platform_settings (using .env fallback)');
  }
}

function get(key) {
  const v = cache[key];
  if (v !== undefined && v !== null && v !== '') return v;
  const envKey = ENV_FALLBACK[key];
  return envKey ? (process.env[envKey] || '') : '';
}

// Where get(key) currently resolves from: a non-empty DB value ('db'), the env
// fallback ('env'), or nowhere ('none'). Lets the admin UI say "inherited from
// the environment" without ever revealing the value itself.
function source(key) {
  const v = cache[key];
  if (v !== undefined && v !== null && v !== '') return 'db';
  const envKey = ENV_FALLBACK[key];
  if (envKey && process.env[envKey]) return 'env';
  return 'none';
}

async function setMany(obj) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    await query(
      `INSERT INTO platform_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [k, v]
    );
    cache[k] = v;
  }
}

module.exports = {
  load,
  get,
  source,
  setMany,
  isLoaded: () => loaded,
  INTEGRATION_KEYS,
  SECRET_KEYS,
};
