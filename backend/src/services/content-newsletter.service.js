const crypto = require('crypto');
const { query } = require('../config/db');
const logger = require('../utils/logger');

// Real NEWSLETTER publisher (Batch T) — a double-opt-in subscriber list plus an
// SMTP send adapter for the `newsletter_community` / `newsletter_ecosystem`
// channels. CONFIG-GATED and INERT (mirrors whatsapp.service.isConfigured() and
// the Batch S social gating): with no SMTP configured the publisher resolves the
// OUTBOX adapter instead, so nothing existing breaks.
//
// SECURITY / PRIVACY:
//   - The public subscribe flow NEVER reveals whether an address already exists
//     (no enumeration) and returns no e-mail address.
//   - Sends log COUNTS ONLY — recipient addresses are never logged.
//   - `nodemailer` is required LAZILY inside getTransport(), so the dependency is
//     only touched when SMTP is actually configured.

const DEFAULT_BASE_URL = 'https://khata.dadashaik.com';
const MAX_BATCH = 2000; // sane cap on recipients per broadcast
const CONCURRENCY = 10; // modest parallel sends
const VALID_LISTS = Object.freeze(['community', 'ecosystem']);

// channel <-> list mapping.
const LIST_BY_CHANNEL = Object.freeze({
  newsletter_community: 'community',
  newsletter_ecosystem: 'ecosystem',
});

// A cached built transport (undefined = not built yet, null = unconfigured), and
// a test-only injected transport that overrides everything.
let cachedTransport;
let injectedTransport = null;

// TEST SEAM ONLY — inject a fake nodemailer-like transport ({ sendMail }). Never
// called in production paths.
function __setTransport(t) {
  injectedTransport = t || null;
  cachedTransport = undefined;
}

// The public base URL (never derived from a request). Mirrors the social
// service's baseUrl().
function baseUrl() {
  const raw = process.env.PUBLIC_BASE_URL && process.env.PUBLIC_BASE_URL.trim();
  return (raw || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

// isConfigured() — true when SMTP is configured: SMTP_URL OR (SMTP_HOST +
// SMTP_PORT), plus a NEWSLETTER_FROM address. Reads process.env directly (like
// token-crypto / the social service), lazily, so a later env change is honored.
function isConfigured() {
  const hasServer = Boolean(
    (process.env.SMTP_URL && process.env.SMTP_URL.trim()) ||
      (process.env.SMTP_HOST && process.env.SMTP_HOST.trim() &&
        process.env.SMTP_PORT && String(process.env.SMTP_PORT).trim())
  );
  return Boolean(hasServer && process.env.NEWSLETTER_FROM && process.env.NEWSLETTER_FROM.trim());
}

// Build (and cache) a nodemailer transport from the env, or return null when
// unconfigured. `nodemailer` is required lazily here only. A test-injected
// transport always wins.
function getTransport() {
  if (injectedTransport) return injectedTransport;
  if (!isConfigured()) return null;
  if (cachedTransport !== undefined) return cachedTransport;

  // eslint-disable-next-line global-require
  const nodemailer = require('nodemailer');
  const { SMTP_URL, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;
  if (SMTP_URL && SMTP_URL.trim()) {
    cachedTransport = nodemailer.createTransport(SMTP_URL.trim());
  } else {
    const port = Number(SMTP_PORT);
    cachedTransport = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: SMTP_SECURE === 'true' || port === 465,
      auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
  }
  return cachedTransport;
}

// The public confirm/unsubscribe links carried in e-mails.
function confirmLink(token) {
  return `${baseUrl()}/api/public/newsletter/confirm?token=${encodeURIComponent(token)}`;
}
function unsubLink(token) {
  return `${baseUrl()}/api/public/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
}

// A random opaque token (hex).
function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Send the double-opt-in confirmation e-mail (plain, branded). Best-effort — a
// send failure is swallowed by the caller so subscribe() never leaks send state.
async function sendConfirmation(transport, email, token) {
  const link = confirmLink(token);
  await transport.sendMail({
    from: process.env.NEWSLETTER_FROM,
    to: email,
    subject: 'Confirm your Smart Digital Khata subscription',
    text:
      'Namaste!\n\n' +
      'Please confirm your Smart Digital Khata newsletter subscription by opening this link:\n' +
      `${link}\n\n` +
      'If you did not request this, you can safely ignore this e-mail — no subscription will be created.\n\n' +
      '— Smart Digital Khata',
  });
}

// ---------------------------------------------------------------------------
// Subscriber lifecycle (public) — double opt-in
// ---------------------------------------------------------------------------
// subscribe(email, list) — upsert a `pending` subscriber with fresh tokens; if
// SMTP is configured, e-mail the confirmation link. NEVER reveals whether the
// address already existed, and returns no address. An already-`active` row is
// left active (idempotent) and gets no new confirmation e-mail.
async function subscribe(email, list) {
  const em = String(email || '').trim().toLowerCase();
  const li = VALID_LISTS.includes(String(list)) ? String(list) : 'community';
  if (!em) return { ok: true };

  const confirmToken = newToken();
  const unsubToken = newToken();

  // On conflict: an active row stays active (keep its tokens); any other state
  // resets to pending with a fresh confirm token so the opt-in can be re-driven.
  const r = await query(
    `INSERT INTO newsletter_subscribers (email, list, status, confirm_token, unsub_token)
     VALUES ($1,$2,'pending',$3,$4)
     ON CONFLICT (email, list) DO UPDATE SET
       status = CASE WHEN newsletter_subscribers.status = 'active' THEN 'active' ELSE 'pending' END,
       confirm_token = CASE WHEN newsletter_subscribers.status = 'active'
                            THEN newsletter_subscribers.confirm_token ELSE EXCLUDED.confirm_token END,
       unsub_token = COALESCE(newsletter_subscribers.unsub_token, EXCLUDED.unsub_token)
     RETURNING status, confirm_token`,
    [em, li, confirmToken, unsubToken]
  );
  const row = r.rows[0];

  // Send the confirmation only for a genuinely pending opt-in and only when SMTP
  // is configured. Swallow send errors (never leak whether a send happened).
  const transport = getTransport();
  if (transport && row && row.status === 'pending' && row.confirm_token) {
    try {
      await sendConfirmation(transport, em, row.confirm_token);
    } catch (err) {
      logger.warn({ list: li, err: err && err.message }, 'newsletter confirmation send failed');
    }
  }
  return { ok: true };
}

// confirm(token) — activate the pending subscriber that owns the token. Safe on
// an unknown/expired/reused token (no rows updated) and idempotent.
async function confirm(token) {
  const t = String(token || '');
  if (!t) return { ok: true };
  await query(
    `UPDATE newsletter_subscribers
     SET status = 'active', confirmed_at = NOW(), confirm_token = NULL
     WHERE confirm_token = $1 AND status = 'pending'`,
    [t]
  );
  return { ok: true };
}

// unsubscribe(token) — mark the owner of the token unsubscribed. Safe on an
// unknown token and idempotent.
async function unsubscribe(token) {
  const t = String(token || '');
  if (!t) return { ok: true };
  await query(
    `UPDATE newsletter_subscribers
     SET status = 'unsubscribed', unsubscribed_at = NOW()
     WHERE unsub_token = $1 AND status <> 'unsubscribed'`,
    [t]
  );
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The newsletter adapter — send(item, ctx)
// ---------------------------------------------------------------------------
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Broadcast item.body to every `active` subscriber of the list that maps to the
// channel, each with an unsubscribe footer. Returns { result:'sent',
// externalRef:'newsletter:<count>' } (0 for an empty list is still 'sent'), or
// { result:'failed', detail } with no transport or when every send errored.
// Addresses are NEVER logged — counts only. A test injects ctx.transport.
const newsletterAdapter = Object.freeze({
  name: 'newsletter',
  async send(item, ctx = {}) {
    const transport = ctx.transport || getTransport();
    if (!transport) return { result: 'failed', detail: 'SMTP not configured' };

    const list = LIST_BY_CHANNEL[item && item.channel];
    if (!list) return { result: 'failed', detail: 'unknown newsletter channel' };

    const subject = (item.title && String(item.title).trim()) || 'Smart Digital Khata newsletter';
    const body = item.body != null ? String(item.body) : '';

    const r = await query(
      `SELECT email, unsub_token FROM newsletter_subscribers
       WHERE list = $1 AND status = 'active'
       ORDER BY created_at ASC
       LIMIT $2`,
      [list, MAX_BATCH]
    );
    const subs = r.rows;

    let sent = 0;
    let failed = 0;
    for (const group of chunk(subs, CONCURRENCY)) {
      const results = await Promise.allSettled(
        group.map((s) =>
          transport.sendMail({
            from: process.env.NEWSLETTER_FROM,
            to: s.email,
            subject,
            text:
              `${body}\n\n` +
              '---\n' +
              `You are receiving this because you subscribed to the Smart Digital Khata ${list} newsletter.\n` +
              `Unsubscribe: ${unsubLink(s.unsub_token)}`,
          })
        )
      );
      for (const res of results) {
        if (res.status === 'fulfilled') sent += 1;
        else failed += 1;
      }
    }

    // COUNTS ONLY — never any address.
    logger.info({ channel: item.channel, list, recipients: subs.length, sent, failed }, 'newsletter broadcast');

    if (sent === 0 && failed > 0) {
      return { result: 'failed', detail: `newsletter send failed (${failed})` };
    }
    return { result: 'sent', externalRef: `newsletter:${sent}`, detail: `newsletter sent to ${sent} subscriber(s)` };
  },
});

// The publisher's config-gated registry (mirrors content-social.ADAPTERS): both
// newsletter channels resolve to the one adapter.
const ADAPTERS = Object.freeze({
  newsletter_community: newsletterAdapter,
  newsletter_ecosystem: newsletterAdapter,
});

// publishConfigured(channel) — a newsletter channel is publishable iff SMTP is
// configured. (An empty active list still "publishes" 0 — that is fine.)
function publishConfigured(channel) {
  if (!LIST_BY_CHANNEL[channel]) return false;
  return isConfigured();
}

module.exports = {
  isConfigured,
  getTransport,
  publishConfigured,
  subscribe,
  confirm,
  unsubscribe,
  newsletterAdapter,
  ADAPTERS,
  baseUrl,
  confirmLink,
  unsubLink,
  LIST_BY_CHANNEL,
  VALID_LISTS,
  __setTransport,
};
