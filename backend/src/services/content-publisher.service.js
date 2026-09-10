const { randomUUID } = require('crypto');
const { withTx } = require('../config/db');
const { gateAllows } = require('../utils/content-workflow');

// Scheduler/publisher for the content engine, with a PLUGGABLE per-channel
// adapter interface. Every channel has an always-available OUTBOX fallback; the
// `linkedin` and `twitter` channels ALSO gain REAL OAuth publishers (Batch S)
// that engage only when the operator has connected an account (see
// content-social.service). With no credentials / no connected account a channel
// keeps using the outbox, so the pipeline never breaks.
//
// The tier gate is RE-CHECKED here (belt-and-suspenders with the SQL WHERE) so a
// Tier 1/2 item WITHOUT a recorded human approval can NEVER be published.
//
// publishDue runs CLAIM -> SEND -> FINALIZE: a short tx claims due, gate-cleared
// rows (stamping publish_started_at); the network POST happens OUTSIDE any tx;
// then a short tx records the outcome. This keeps a slow/flaky social API from
// ever holding a row lock open.

const MAX_PUBLISH_ATTEMPTS = 3;
const STALE_CLAIM_MS = 15 * 60 * 1000; // reclaim a stuck in-flight item after 15 min

// Write one row to the publish log. The publisher calls this in FINALIZE with the
// adapter's true result ('sent' | 'failed'); the outbox result is always 'sent'.
async function logPublish(client, { contentId, channel, adapter, result, externalRef, detail }) {
  await client.query(
    `INSERT INTO content_publish_log (content_id, channel, adapter, result, external_ref, detail)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [contentId, channel, adapter, result, externalRef || null, detail || null]
  );
}

// The OUTBOX adapter — the always-available fallback. It performs NO network
// call and holds NO DB tx: it mints a synthetic external_ref and returns a
// 'sent' result. The publisher's FINALIZE step writes the log row. This is the
// contract every real adapter implements: send() returns
// { result:'sent', externalRef, detail } or { result:'failed', detail }.
const outboxAdapter = Object.freeze({
  name: 'outbox',
  async send(item) {
    return {
      result: 'sent',
      externalRef: `outbox:${randomUUID()}`,
      detail: 'outbox — no live publisher configured',
    };
  },
});

// Per-channel SYNC default registry — every channel maps to the outbox adapter.
// The async resolveAdapter() below swaps in a real social adapter at send time
// when that channel has a connected account.
//   TODO: real blog adapter — publish to the marketing site/CMS.
//   TODO: real newsletter_community adapter — ESP broadcast (community list).
//   TODO: real newsletter_ecosystem adapter — ESP broadcast (ecosystem list).
//   TODO: real whatsapp_tip adapter — WhatsApp broadcast/template send.
//   TODO: real reel adapter — Instagram/YouTube upload.
//   TODO: real voice adapter — voice-note distribution.
const adapters = Object.freeze({
  blog: outboxAdapter,
  linkedin: outboxAdapter,
  twitter: outboxAdapter,
  facebook: outboxAdapter,
  instagram: outboxAdapter,
  newsletter_community: outboxAdapter,
  newsletter_ecosystem: outboxAdapter,
  whatsapp_tip: outboxAdapter,
  reel: outboxAdapter,
  voice: outboxAdapter,
});

// The SYNC outbox default for a channel (kept for callers/tests that want the
// dependency-free adapter without a DB check).
function adapterFor(channel) {
  return adapters[channel] || outboxAdapter;
}

// resolveAdapter(channel) — the ASYNC resolver publishDue uses. It consults each
// config-gated adapter registry in turn and returns the first REAL adapter whose
// channel is publishConfigured, else the always-available OUTBOX. Every registry
// follows the SAME shape ({ ADAPTERS, publishConfigured }) so adding a publisher
// is a localized edit. Lazy-require avoids a load-time cycle. Resolution order:
//   - social (Batch S): linkedin/twitter — real when a connected account exists.
//   - meta (Batch FBIG1): facebook/instagram — the meta adapter (INERT/gated:
//     it self-checks metaConfigured() and gracefully skips, never calling Graph,
//     until a Meta app is wired).
//   - blog (Batch T): the `blog` channel — INTERNAL, always configured.
//   - newsletter (Batch T): newsletter_* — real when SMTP is configured, else
//     this falls through to the outbox (inert without SMTP).
// This ONLY changes which adapter a channel resolves to; publishDue's
// CLAIM->SEND->FINALIZE flow and the tier gate are untouched.
async function resolveAdapter(channel) {
  const registries = [
    require('./content-social.service'),
    require('./content-meta.service'),
    require('./content-blog.service'),
    require('./content-newsletter.service'),
  ];
  for (const reg of registries) {
    if (reg.ADAPTERS && reg.ADAPTERS[channel] && (await reg.publishConfigured(channel))) {
      return reg.ADAPTERS[channel];
    }
  }
  return adapterFor(channel);
}

// CLAIM — one short tx: select due + gate-cleared rows that are unclaimed (or
// whose claim has gone stale) FOR UPDATE SKIP LOCKED, re-check the gate per row,
// stamp publish_started_at + bump publish_attempts, and return the claimed rows.
// The SQL WHERE already excludes an unapproved Tier 1/2 item.
async function claimDue(now, staleBefore) {
  return withTx(async (client) => {
    const due = await client.query(
      `SELECT * FROM content_items
       WHERE status = 'scheduled'
         AND scheduled_at IS NOT NULL
         AND scheduled_at <= $1
         AND (autonomy_tier = 0 OR approved_at IS NOT NULL)
         AND (publish_started_at IS NULL OR publish_started_at < $2)
       ORDER BY scheduled_at ASC
       FOR UPDATE SKIP LOCKED`,
      [now, staleBefore]
    );

    const claimed = [];
    for (const item of due.rows) {
      // Defensive re-enforcement of the human-approval gate. Should always pass
      // given the WHERE above; a failure here means SKIP (never publish).
      const gate = gateAllows({
        to: 'published',
        tier: item.autonomy_tier,
        approvedAt: item.approved_at,
        actorKind: 'system',
      });
      if (!gate.ok) continue;

      await client.query(
        `UPDATE content_items
         SET publish_started_at = $1, publish_attempts = publish_attempts + 1, updated_at = NOW()
         WHERE id = $2`,
        [now, item.id]
      );
      claimed.push({ ...item, publish_attempts: (item.publish_attempts || 0) + 1 });
    }
    return claimed;
  });
}

// FINALIZE — one short tx per item: record the send outcome. On 'sent' the item
// becomes published (+ log + system event). On 'failed' we log the failure and,
// unless we have hit the attempt cap, CLEAR publish_started_at so a later tick
// retries; at the cap we leave it claimed/failed.
async function finalize(now, item, adapter, sendResult) {
  return withTx(async (client) => {
    if (sendResult.result === 'sent') {
      await client.query(
        `UPDATE content_items
         SET status = 'published', published_at = $1, external_ref = $2,
             publish_started_at = NULL, updated_at = NOW()
         WHERE id = $3`,
        [now, sendResult.externalRef || null, item.id]
      );
      await logPublish(client, {
        contentId: item.id,
        channel: item.channel,
        adapter: adapter.name,
        result: 'sent',
        externalRef: sendResult.externalRef,
        detail: sendResult.detail,
      });
      await client.query(
        `INSERT INTO content_events (content_id, from_status, to_status, actor, actor_kind, note)
         VALUES ($1,'scheduled','published',NULL,'system',$2)`,
        [item.id, `published via ${adapter.name} adapter`]
      );
      return 'published';
    }

    // Failed send.
    await logPublish(client, {
      contentId: item.id,
      channel: item.channel,
      adapter: adapter.name,
      result: 'failed',
      externalRef: null,
      detail: sendResult.detail || 'send failed',
    });
    const attempts = item.publish_attempts || 0;
    if (attempts < MAX_PUBLISH_ATTEMPTS) {
      // Release the claim so a later tick retries.
      await client.query(
        `UPDATE content_items SET publish_started_at = NULL, updated_at = NOW() WHERE id = $1`,
        [item.id]
      );
    }
    // At the cap we leave publish_started_at set (claimed/failed) — no more auto
    // retries until it goes stale; the failure is recorded in the publish log.
    return 'failed';
  });
}

// publishDue(now, { httpFetch }) — publish every scheduled item that is due AND
// cleared by the tier gate, via CLAIM -> SEND (outside any tx) -> FINALIZE. The
// real social adapter is used when the channel is connected, else the outbox.
// Returns { published, failed }.
async function publishDue(now = new Date(), { httpFetch } = {}) {
  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS);
  const claimed = await claimDue(now, staleBefore);

  let published = 0;
  let failed = 0;
  for (const item of claimed) {
    // Resolve + send OUTSIDE any transaction — no row lock is held during I/O.
    const adapter = await resolveAdapter(item.channel);
    let sendResult;
    try {
      sendResult = await adapter.send(item, { httpFetch });
    } catch (err) {
      // A thrown error is treated as an ordinary failure (never a crash).
      sendResult = { result: 'failed', detail: 'adapter threw during send' };
    }
    const outcome = await finalize(now, item, adapter, sendResult);
    if (outcome === 'published') published += 1; else failed += 1;
  }
  return { published, failed };
}

module.exports = {
  adapters,
  outboxAdapter,
  adapterFor,
  resolveAdapter,
  logPublish,
  publishDue,
  MAX_PUBLISH_ATTEMPTS,
};
