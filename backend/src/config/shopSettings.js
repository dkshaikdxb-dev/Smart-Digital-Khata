const { query } = require('./db');

/**
 * Per-shop settings, stored in the shop_settings table (keyed by shop_id + key).
 * Used for each shop's OWN Razorpay connection so customer payments settle
 * directly to that shop. No global cache — always read fresh from the DB.
 *
 * Per-shop Razorpay keys live under:
 *   RZP_KEY_ID, RZP_KEY_SECRET, RZP_WEBHOOK_SECRET, RZP_WEBHOOK_TOKEN
 */

async function get(shopId, key) {
  const r = await query(
    'SELECT value FROM shop_settings WHERE shop_id = $1 AND key = $2',
    [shopId, key]
  );
  return r.rowCount ? r.rows[0].value : null;
}

async function setMany(shopId, obj) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    await query(
      `INSERT INTO shop_settings (shop_id, key, value, updated_at) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (shop_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [shopId, k, v]
    );
  }
}

/**
 * Fetch the shop's Razorpay settings in one query.
 * @returns {{ key_id, key_secret, webhook_secret, webhook_token }} values may be null.
 */
async function getRazorpay(shopId) {
  const r = await query(
    `SELECT key, value FROM shop_settings
     WHERE shop_id = $1
       AND key IN ('RZP_KEY_ID','RZP_KEY_SECRET','RZP_WEBHOOK_SECRET','RZP_WEBHOOK_TOKEN')`,
    [shopId]
  );
  const map = {};
  for (const row of r.rows) map[row.key] = row.value;
  return {
    key_id: map.RZP_KEY_ID || null,
    key_secret: map.RZP_KEY_SECRET || null,
    webhook_secret: map.RZP_WEBHOOK_SECRET || null,
    webhook_token: map.RZP_WEBHOOK_TOKEN || null,
  };
}

module.exports = { get, setMany, getRazorpay };
