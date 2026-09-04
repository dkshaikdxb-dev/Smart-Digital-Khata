const { query } = require('./db');
const logger = require('../utils/logger');

/**
 * Platform settings with DB storage + .env fallback.
 * Values set via the admin UI live in platform_settings and override .env.
 * Loaded into memory at startup and refreshed on every write.
 */

// setting key -> env var used as fallback when the DB value is empty
const ENV_FALLBACK = {
  RAZORPAY_KEY_ID: 'RAZORPAY_KEY_ID',
  RAZORPAY_KEY_SECRET: 'RAZORPAY_KEY_SECRET',
  RAZORPAY_WEBHOOK_SECRET: 'RAZORPAY_WEBHOOK_SECRET',
  RAZORPAY_PLAN_PRO: 'RAZORPAY_PLAN_PRO',
  RAZORPAY_PLAN_FAMILY: 'RAZORPAY_PLAN_FAMILY',
  WHATSAPP_API_URL: 'WHATSAPP_API_URL',
  WHATSAPP_API_TOKEN: 'WHATSAPP_API_TOKEN',
  WHATSAPP_PHONE_NUMBER_ID: 'WHATSAPP_PHONE_NUMBER_ID',
  WHATSAPP_VERIFY_TOKEN: 'WHATSAPP_VERIFY_TOKEN',
  WHATSAPP_BUSINESS_ACCOUNT_ID: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
  WHATSAPP_TEMPLATE_REMINDER: 'WHATSAPP_TEMPLATE_REMINDER',
  WHATSAPP_TEMPLATE_LANG: 'WHATSAPP_TEMPLATE_LANG',
};

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

module.exports = { load, get, setMany, isLoaded: () => loaded };
