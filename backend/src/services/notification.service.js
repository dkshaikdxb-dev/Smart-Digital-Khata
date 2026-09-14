const { query } = require('../config/db');
const whatsapp = require('./whatsapp.service');
const settings = require('../config/settings');
const logger = require('../utils/logger');
const { netCreditSalesSql } = require('../utils/creditSales');
// The server's override-backed translator (batch LANG). Every customer-facing
// line below used to be an English string literal; they are now keys resolved
// against `i18n_overrides` — the same table the web app and the regional seed
// use — so a shopper reads their WhatsApp in the language they picked.
const serverI18n = require('../utils/server-i18n');

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

/**
 * The language to write to THIS customer in: their own stored choice
 * (`customers.customer_language`, migration 0074), else English.
 *
 * Deliberately NOT the shop's language. The owner's setting says what the
 * SHOPKEEPER reads; assuming it for every one of their customers would put a
 * language on someone's phone that they never picked. A customer who has never
 * used the consumer app has no stored language and keeps getting English,
 * exactly as before.
 *
 * A caller that already loaded the row (SELECT *) passes it through for free;
 * one that assembled a partial object gets a single extra lookup rather than a
 * silent fall back to English.
 */
async function customerLang(customer) {
  if (!customer) return null;
  if (customer.customer_language !== undefined) return customer.customer_language;
  if (!customer.id) return null;
  try {
    const r = await query('SELECT customer_language FROM customers WHERE id = $1', [customer.id]);
    return r.rowCount ? r.rows[0].customer_language : null;
  } catch (_e) {
    return null;
  }
}

async function onTransaction(shopId, customer, tx) {
  try {
    if (customer.notifications_enabled === false) return;
    const shopRes = await query('SELECT name, notification_mode FROM shops WHERE id=$1', [shopId]);
    if (!shopRes.rowCount) return;
    const { name: shopName, notification_mode: mode } = shopRes.rows[0];

    if (mode === 'silent') return;
    // A smart-mode purchase under the threshold is not sent at all — decided
    // before any translation work so nothing is loaded for a message that will
    // never go out.
    if (tx.type === 'purchase' && mode === 'smart' && Number(tx.amount) < SMART_THRESHOLD) return;

    const t = await serverI18n.translator(await customerLang(customer));
    const amount = `₹${fmtRs(tx.amount)}`;
    const balance = `₹${fmtRs(customer.balance)}`;
    const who = { name: customer.name, shop: shopName };

    let message;
    if (tx.type === 'purchase') {
      message =
        `${t('wa.tx.purchase.intro', who)}\n` +
        `${t('wa.tx.purchase.amount', { amount })}\n` +
        `${t('wa.tx.outstanding', { amount: balance })}\n` +
        (tx.note ? `${t('wa.tx.note', { note: tx.note })}\n` : '');
    } else if (tx.type === 'adjustment') {
      // A shop ADJUSTMENT (batch C) lowers the balance like a payment does, but
      // the customer handed over nothing — telling them "we received your
      // payment" would be plainly false. The order-edit path composes its own,
      // much fuller message through utils/order-customer-copy and does not call
      // this function at all; this branch exists so that any FUTURE caller which
      // does route an adjustment through here cannot send the wrong sentence.
      message =
        `${t('wa.tx.adjustment', { ...who, amount })}\n` +
        `${t('wa.tx.outstanding', { amount: balance })}\n` +
        (tx.note ? `${t('wa.tx.note', { note: tx.note })}\n` : '');
    } else {
      // payment received — always notify on smart & active
      message =
        `${t('wa.tx.payment', { ...who, amount })}\n` +
        `${t('wa.tx.remaining', { amount: balance })}`;
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
    // Never dun a customer with no dues. A balance <= 0 means the khata is settled
    // or the customer is in ADVANCE (a negative balance = a single-merchant pre-pay,
    // batch WALLET1); a "please pay your outstanding ₹-50" reminder would be wrong.
    // The automated daily-reminder enqueue and the outstanding broadcast already
    // filter `balance > 0`; this is the last-line guard so the manual per-customer
    // remind path can never dun an advance/settled customer either.
    if (Number(customer.balance) <= 0) return;
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

    const t = await serverI18n.translator(await customerLang(customer));
    const msg =
      `${t('wa.reminder.intro', { name: customer.name, shop: shopName })}\n` +
      `${t('wa.reminder.body', { amount: `₹${balance}` })}`;
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
        // "Sales on credit" is NET of the compensating adjustments a cancelled or
        // reduced order leaves in the append-only ledger (batch DATA D4) — the
        // same definition /summaries/today and /analytics/overview use, so the
        // nightly message and the app cannot disagree. Without it a rejected
        // order was still reported as sold, AND "sales − collected" no longer
        // reconciled with the outstanding figure two lines below it.
        `SELECT
           ${netCreditSalesSql('t')} AS purchases,
           COALESCE(SUM(CASE WHEN t.type IN ('cash','upi') THEN t.amount END),0) AS collections,
           COUNT(*) AS tx_count
         FROM transactions t
         WHERE t.shop_id = $1 AND t.created_at >= date_trunc('day', NOW())`,
        [shopId]
      ),
      query(
        // "Total outstanding" is a RECEIVABLES figure: sum only positive balances,
        // matching the debtor COUNT filter. A customer in advance (negative balance
        // = a single-merchant pre-pay, batch WALLET1) must never net down the
        // receivables owed by other customers.
        `SELECT COALESCE(SUM(balance) FILTER (WHERE balance > 0),0) AS total,
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

module.exports = { onTransaction, sendReminder, sendOwnerDigest, customerLang };
