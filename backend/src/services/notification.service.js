const { query } = require('../config/db');
const whatsapp = require('./whatsapp.service');
const logger = require('../utils/logger');

/**
 * Notification modes:
 *   silent  — never auto-notify (owner can still manually share)
 *   smart   — notify on big events: purchase > X, payment received, weekly summary
 *   active  — notify on every transaction, plus daily reminders
 */

const SMART_THRESHOLD = 20000; // paise — ₹200

async function onTransaction(shopId, customer, tx) {
  try {
    const shopRes = await query('SELECT name, notification_mode FROM shops WHERE id=$1', [shopId]);
    if (!shopRes.rowCount) return;
    const { name: shopName, notification_mode: mode } = shopRes.rows[0];

    if (mode === 'silent') return;

    const amount = (Number(tx.amount) / 100).toFixed(2);
    const balance = (Number(customer.balance) / 100).toFixed(2);

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

async function sendReminder(shopId, customer) {
  try {
    const shopRes = await query('SELECT name FROM shops WHERE id=$1', [shopId]);
    if (!shopRes.rowCount) return;
    const { name: shopName } = shopRes.rows[0];
    const balance = (Number(customer.balance) / 100).toFixed(2);
    const msg =
      `Hi ${customer.name}, friendly reminder from ${shopName}.\n` +
      `Your outstanding amount is ₹${balance}. Please pay at your convenience.`;
    await whatsapp.sendText(customer.phone, msg);
  } catch (err) {
    logger.error({ err: err.message }, 'notification.sendReminder failed');
  }
}

module.exports = { onTransaction, sendReminder };
