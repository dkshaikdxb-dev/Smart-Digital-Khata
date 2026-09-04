const { query } = require('../config/db');
const whatsapp = require('./whatsapp.service');
const settings = require('../config/settings');
const logger = require('../utils/logger');

/**
 * Notification modes (per shop):
 *   silent  — never auto-notify (owner can still manually share)
 *   smart   — notify on big events: purchase > threshold, payment received
 *   active  — notify on every transaction, plus daily reminders
 *
 * Per customer: notifications_enabled=false suppresses ALL automatic
 * customer-facing messages regardless of shop mode.
 */

const SMART_THRESHOLD = 20000; // paise — ₹200

function fmtRs(paise) {
  return (Number(paise) / 100).toFixed(2);
}

async function onTransaction(shopId, customer, tx) {
  try {
    if (customer.notifications_enabled === false) return;
    const shopRes = await query('SELECT name, notification_mode FROM shops WHERE id=$1', [shopId]);
    if (!shopRes.rowCount) return;
    const { name: shopName, notification_mode: mode } = shopRes.rows[0];

    if (mode === 'silent') return;

    const amount = fmtRs(tx.amount);
    const balance = fmtRs(customer.balance);

    let message;
    if (tx.type === 'purchase') {
      if (mode === 'smart' && Number(tx.amount) < SMART_THRESHOLD) return;
      message =
        `Hi ${customer.name}, this is ${shopName}.\n` +
        `Purchase recorded: ₹${amount}.\n` +
        `Outstanding: ₹${balance}.\n` +
        (tx.note ? `Note: ${tx.note}\n` : '');
    } else {
      // payment received — always notify on smart & active
      message =
        `Hi ${customer.name}, ${shopName} received your payment of ₹${amount}.\n` +
        `Remaining: ₹${balance}. Thank you!`;
    }

    await whatsapp.sendText(customer.phone, message);
  } catch (err) {
    logger.error({ err: err.message }, 'notification.onTransaction failed');
  }
}

/**
 * Dues reminder to a customer.
 * Uses a Meta-approved template (WHATSAPP_TEMPLATE_REMINDER) when configured —
 * required for delivery outside the 24-hour customer-service window — and
 * falls back to a session text message otherwise.
 * Template variable order: {{1}} customer name, {{2}} shop name, {{3}} amount.
 */
async function sendReminder(shopId, customer) {
  try {
    if (customer.notifications_enabled === false) return;
    const shopRes = await query('SELECT name FROM shops WHERE id=$1', [shopId]);
    if (!shopRes.rowCount) return;
    const { name: shopName } = shopRes.rows[0];
    const balance = fmtRs(customer.balance);

    const templateName = settings.get('WHATSAPP_TEMPLATE_REMINDER');
    if (templateName && whatsapp.isConfigured()) {
      await whatsapp.sendTemplate(
        customer.phone,
        templateName,
        settings.get('WHATSAPP_TEMPLATE_LANG') || 'en',
        [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: customer.name },
              { type: 'text', text: shopName },
              { type: 'text', text: `₹${balance}` },
            ],
          },
        ]
      );
      return;
    }

    const msg =
      `Hi ${customer.name}, friendly reminder from ${shopName}.\n` +
      `Your outstanding amount is ₹${balance}. Please pay at your convenience.`;
    await whatsapp.sendText(customer.phone, msg);
  } catch (err) {
    logger.error({ err: err.message }, 'notification.sendReminder failed');
  }
}

/**
 * "Aaj ka hisaab" — end-of-day summary WhatsApp to the SHOP OWNER.
 * Sent when shops.daily_digest = true (independent of notification_mode,
 * which governs customer-facing messages).
 */
async function sendOwnerDigest(shopId) {
  try {
    const shopRes = await query(
      `SELECT s.name, s.daily_digest, u.phone AS owner_phone
       FROM shops s JOIN users u ON u.id = s.owner_id
       WHERE s.id = $1`,
      [shopId]
    );
    if (!shopRes.rowCount || !shopRes.rows[0].daily_digest) return;
    const { name: shopName, owner_phone } = shopRes.rows[0];

    const [today, outstanding] = await Promise.all([
      query(
        `SELECT
           COALESCE(SUM(CASE WHEN type='purchase' THEN amount END),0) AS purchases,
           COALESCE(SUM(CASE WHEN type IN ('cash','upi') THEN amount END),0) AS collections,
           COUNT(*) AS tx_count
         FROM transactions
         WHERE shop_id = $1 AND created_at >= date_trunc('day', NOW())`,
        [shopId]
      ),
      query(
        `SELECT COALESCE(SUM(balance),0) AS total,
                COUNT(*) FILTER (WHERE balance > 0) AS debtors
         FROM customers WHERE shop_id = $1 AND status='active'`,
        [shopId]
      ),
    ]);
    const t = today.rows[0];
    const o = outstanding.rows[0];

    const msg =
      `${shopName} — Aaj ka hisaab\n` +
      `Sales on credit: ₹${fmtRs(t.purchases)}\n` +
      `Collected: ₹${fmtRs(t.collections)}\n` +
      `Entries: ${t.tx_count}\n` +
      `Total outstanding: ₹${fmtRs(o.total)} (${o.debtors} customers)`;

    await whatsapp.sendText(owner_phone, msg);
  } catch (err) {
    logger.error({ err: err.message, shopId }, 'notification.sendOwnerDigest failed');
  }
}

module.exports = { onTransaction, sendReminder, sendOwnerDigest };
