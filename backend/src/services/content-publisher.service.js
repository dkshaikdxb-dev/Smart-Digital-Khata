const { randomUUID } = require('crypto');
const { withTx } = require('../config/db');
const { gateAllows } = require('../utils/content-workflow');

// Scheduler/publisher for the content engine, with a PLUGGABLE per-channel
// adapter interface. Right now EVERY channel uses the dependency-free OUTBOX
// adapter, so the pipeline works end-to-end with no external creds or network:
// "publishing" records the send to content_publish_log and stamps the item
// published. When an operator provides real credentials, swap a channel's entry
// in the `adapters` registry for a real adapter (see the TODO slots below).
//
// The tier gate is RE-CHECKED here (belt-and-suspenders with the SQL WHERE) so a
// Tier 1/2 item WITHOUT a recorded human approval can NEVER be published.

// Write one row to the publish log. A real adapter calls this with the true
// result ('sent' | 'failed'); the outbox always records 'sent'.
async function logPublish(client, { contentId, channel, adapter, result, externalRef, detail }) {
  await client.query(
    `INSERT INTO content_publish_log (content_id, channel, adapter, result, external_ref, detail)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [contentId, channel, adapter, result, externalRef || null, detail || null]
  );
}

// The OUTBOX adapter — the always-available fallback. It performs NO network
// call: it mints a synthetic external_ref, records a 'sent' publish-log row, and
// returns { externalRef }. This is the contract every real adapter implements.
//
// A real adapter's send() would: (1) POST the item to the channel's API, (2) log
// the true 'sent'/'failed' result + the real external id, (3) return { externalRef }.
const outboxAdapter = Object.freeze({
  name: 'outbox',
  async send(item, ctx) {
    const externalRef = `outbox:${randomUUID()}`;
    await logPublish(ctx.client, {
      contentId: item.id,
      channel: item.channel,
      adapter: 'outbox',
      result: 'sent',
      externalRef,
      detail: 'outbox — no live publisher configured',
    });
    return { externalRef };
  },
});

// Per-channel adapter registry. Every channel maps to the outbox adapter for now.
// Replace an entry with a real adapter once credentials exist:
//   TODO: real blog adapter — publish to the marketing site/CMS.
//   TODO: real linkedin adapter — LinkedIn UGC/Posts API.
//   TODO: real twitter adapter — X/Twitter API.
//   TODO: real newsletter_community adapter — ESP broadcast (community list).
//   TODO: real newsletter_ecosystem adapter — ESP broadcast (ecosystem list).
//   TODO: real whatsapp_tip adapter — WhatsApp broadcast/template send.
//   TODO: real reel adapter — Instagram/YouTube upload.
//   TODO: real voice adapter — voice-note distribution.
// Drafting copy is likewise pluggable and NOT built here:
//   TODO: LLM draft agent — turn an approved brief into `body` (a Tier-gated,
//         human-reviewed step; it must never move an item past 'in_review').
const adapters = Object.freeze({
  blog: outboxAdapter,
  linkedin: outboxAdapter,
  twitter: outboxAdapter,
  newsletter_community: outboxAdapter,
  newsletter_ecosystem: outboxAdapter,
  whatsapp_tip: outboxAdapter,
  reel: outboxAdapter,
  voice: outboxAdapter,
});

function adapterFor(channel) {
  return adapters[channel] || outboxAdapter;
}

// publishDue(now) — publish every scheduled item that is due AND cleared by the
// tier gate. The WHERE clause already excludes an unapproved Tier 1/2 item
// (tier = 0 OR approved_at IS NOT NULL), and gateAllows() re-checks each row
// defensively. Locked FOR UPDATE SKIP LOCKED so concurrent workers don't collide.
// Returns { published }.
async function publishDue(now = new Date()) {
  return withTx(async (client) => {
    const due = await client.query(
      `SELECT * FROM content_items
       WHERE status = 'scheduled'
         AND scheduled_at IS NOT NULL
         AND scheduled_at <= $1
         AND (autonomy_tier = 0 OR approved_at IS NOT NULL)
       ORDER BY scheduled_at ASC
       FOR UPDATE SKIP LOCKED`,
      [now]
    );

    let published = 0;
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

      const adapter = adapterFor(item.channel);
      const { externalRef } = await adapter.send(item, { client });

      await client.query(
        `UPDATE content_items
         SET status = 'published', published_at = $1, external_ref = $2, updated_at = NOW()
         WHERE id = $3`,
        [now, externalRef, item.id]
      );
      await client.query(
        `INSERT INTO content_events (content_id, from_status, to_status, actor, actor_kind, note)
         VALUES ($1,'scheduled','published',NULL,'system',$2)`,
        [item.id, `published via ${adapter.name} adapter`]
      );
      published += 1;
    }
    return { published };
  });
}

module.exports = {
  adapters,
  outboxAdapter,
  adapterFor,
  logPublish,
  publishDue,
};
