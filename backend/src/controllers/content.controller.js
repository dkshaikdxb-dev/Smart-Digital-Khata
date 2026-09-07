const { query, withTx } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { canTransition, gateAllows, isStatus } = require('../utils/content-workflow');
const drafter = require('../services/content-drafter.service');

// Editor-in-chief review desk API. All routes are auth('admin') +
// requirePerm('content:manage') (wired in content.routes.js). The SAFETY CORE —
// the tier gate — is enforced in the transition handler here and, again, in the
// publisher (services/content-publisher.publishDue). Money inside a brief is
// integer paise; nothing here computes money, it only stores/moves items.

const CHANNELS = [
  'blog', 'linkedin', 'twitter', 'newsletter_community', 'newsletter_ecosystem',
  'whatsapp_tip', 'reel', 'voice',
];
const ENGINES = ['record', 'reach'];

// The public shape of a content item (no internal-only columns hidden here — the
// caller is a content:manage admin — but we keep the projection explicit).
function itemView(row) {
  return {
    id: row.id,
    channel: row.channel,
    engine: row.engine,
    autonomy_tier: row.autonomy_tier,
    language: row.language,
    title: row.title,
    brief: row.brief,
    body: row.body,
    status: row.status,
    scheduled_at: row.scheduled_at,
    published_at: row.published_at,
    source: row.source,
    created_by: row.created_by,
    approved_by: row.approved_by,
    approved_at: row.approved_at,
    external_ref: row.external_ref,
    metrics: row.metrics,
    meta: row.meta,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// GET /api/admin/content?status=&channel=&engine= — the desk queue, newest first.
exports.list = async (req, res) => {
  const { status, channel, engine } = req.query;
  const clauses = [];
  const params = [];
  if (status) {
    if (!isStatus(status)) throw ApiError.badRequest('Invalid status filter');
    params.push(status); clauses.push(`status = $${params.length}`);
  }
  if (channel) {
    if (!CHANNELS.includes(channel)) throw ApiError.badRequest('Invalid channel filter');
    params.push(channel); clauses.push(`channel = $${params.length}`);
  }
  if (engine) {
    if (!ENGINES.includes(engine)) throw ApiError.badRequest('Invalid engine filter');
    params.push(engine); clauses.push(`engine = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const r = await query(
    `SELECT * FROM content_items ${where} ORDER BY created_at DESC LIMIT 200`,
    params
  );
  res.json({ items: r.rows.map(itemView) });
};

// GET /api/admin/content/summary — counts by status (desk header).
exports.summary = async (_req, res) => {
  const r = await query('SELECT status, COUNT(*)::int AS c FROM content_items GROUP BY status');
  const by_status = {};
  for (const row of r.rows) by_status[row.status] = row.c;
  const total = r.rows.reduce((s, row) => s + row.c, 0);
  res.json({ by_status, total });
};

// GET /api/admin/content/:id — one item + its recent events.
exports.get = async (req, res) => {
  const r = await query('SELECT * FROM content_items WHERE id = $1', [req.params.id]);
  if (!r.rowCount) throw ApiError.notFound('Content item not found');
  const ev = await query(
    `SELECT id, from_status, to_status, actor, actor_kind, note, created_at
     FROM content_events WHERE content_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.params.id]
  );
  res.json({ item: itemView(r.rows[0]), events: ev.rows });
};

// POST /api/admin/content — create an item. status starts 'idea' or 'draft';
// source 'human'; created_by = req.user.sub. Writes the birth event.
exports.create = async (req, res) => {
  const {
    channel, engine, autonomy_tier: tier, language = 'en',
    title = null, brief = null, body = null, status = 'idea',
  } = req.body;

  const out = await withTx(async (client) => {
    const r = await client.query(
      `INSERT INTO content_items (channel, engine, autonomy_tier, language, title, brief, body, status, source, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'human',$9)
       RETURNING *`,
      [channel, engine, tier, language, title, brief, body, status, req.user.sub]
    );
    const item = r.rows[0];
    await client.query(
      `INSERT INTO content_events (content_id, from_status, to_status, actor, actor_kind, note)
       VALUES ($1, NULL, $2, $3, 'human', 'created')`,
      [item.id, item.status, req.user.sub]
    );
    return item;
  });
  res.status(201).json({ item: itemView(out) });
};

// PATCH /api/admin/content/:id — edit safe fields only, and only while the item
// is not published/archived. NEVER touches status/approved_*/published_* — those
// move exclusively through /transition.
exports.patch = async (req, res) => {
  const cur = await query('SELECT * FROM content_items WHERE id = $1', [req.params.id]);
  if (!cur.rowCount) throw ApiError.notFound('Content item not found');
  const item = cur.rows[0];
  if (item.status === 'published' || item.status === 'archived') {
    throw ApiError.badRequest('A published or archived item cannot be edited');
  }

  const allowed = ['title', 'brief', 'body', 'language', 'scheduled_at', 'autonomy_tier'];
  const sets = [];
  const params = [];
  for (const field of allowed) {
    if (req.body[field] !== undefined) {
      params.push(req.body[field]);
      sets.push(`${field} = $${params.length}`);
    }
  }
  if (!sets.length) throw ApiError.badRequest('No editable fields provided');
  params.push(req.params.id);
  const r = await query(
    `UPDATE content_items SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
    params
  );
  res.json({ item: itemView(r.rows[0]) });
};

// GET /api/admin/content/config — the desk reads this to show whether AI
// drafting is wired. Never exposes the key; just a boolean.
exports.config = async (_req, res) => {
  res.json({ ai_drafting: drafter.isConfigured() });
};

// POST /api/admin/content/:id/draft — hand an idea/draft item to the LLM drafting
// agent. Config-gated (400 when unconfigured — no client is built, no network is
// touched). Parks the item in 'drafting' (transition + human event) and enqueues
// a `content.draft` job so the slow generation runs off the HTTP request. The
// worker (drafter.runDraft) fills the body and moves it to 'draft' — and NEVER
// past the human gate. Returns 202 with the parked item.
exports.draft = async (req, res) => {
  if (!drafter.isConfigured()) {
    throw ApiError.badRequest('AI drafting is not configured');
  }

  const out = await withTx(async (client) => {
    const cur = await client.query('SELECT * FROM content_items WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!cur.rowCount) throw ApiError.notFound('Content item not found');
    const item = cur.rows[0];
    if (item.status !== 'idea' && item.status !== 'draft') {
      throw ApiError.badRequest(`Cannot draft an item in status '${item.status}'`);
    }
    // Park an idea at 'drafting' so the desk shows progress; a re-draft of an
    // existing 'draft' stays put (the worker refreshes its body in place). The
    // agent NEVER advances past 'draft' — the human gate is untouched.
    if (item.status === 'idea') {
      await client.query(
        `UPDATE content_items SET status = 'drafting', updated_at = NOW() WHERE id = $1`,
        [req.params.id]
      );
      await client.query(
        `INSERT INTO content_events (content_id, from_status, to_status, actor, actor_kind, note)
         VALUES ($1,'idea','drafting',$2,'human','queued for AI drafting')`,
        [req.params.id, req.user.sub]
      );
    }
    const r = await client.query('SELECT * FROM content_items WHERE id = $1', [req.params.id]);
    return r.rows[0];
  });

  // Enqueue the actual generation. Lazy-require so the queue/redis is only touched
  // when drafting is genuinely used (app + tests never load BullMQ otherwise).
  const { QUEUES } = require('../jobs');
  await QUEUES.content.add('content.draft', { id: req.params.id }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: 100,
    removeOnFail: 100,
  });

  res.status(202).json({ item: itemView(out) });
};

// POST /api/admin/content/:id/transition { to, note?, scheduled_at? } — the
// guarded move. Enforces canTransition + the tier gate; stamps approval on
// 'approved'; requires a scheduled_at for 'scheduled'; writes an event row.
exports.transition = async (req, res) => {
  const { to, note = null, scheduled_at: schedIn } = req.body;
  if (!isStatus(to)) throw ApiError.badRequest('Invalid target status');

  const out = await withTx(async (client) => {
    const cur = await client.query('SELECT * FROM content_items WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!cur.rowCount) throw ApiError.notFound('Content item not found');
    const item = cur.rows[0];
    const from = item.status;

    if (!canTransition(from, to)) {
      throw ApiError.badRequest(`Cannot move from '${from}' to '${to}'`);
    }

    // 'scheduled' needs a scheduled_at — accept it in the body, else fall back to
    // one already set via PATCH.
    let scheduledAt = item.scheduled_at;
    if (to === 'scheduled') {
      if (schedIn) scheduledAt = schedIn;
      if (!scheduledAt) throw ApiError.badRequest('scheduled_at is required to schedule an item');
    }

    // The TIER GATE. This is a human actor (route requires content:manage). For
    // 'approved' the gate requires a human; for 'scheduled'/'published' it
    // requires tier 0 OR a recorded approval. Approving in THIS transaction sets
    // approved_at, so an approve→schedule in two calls passes on the second.
    const gate = gateAllows({
      to,
      tier: item.autonomy_tier,
      approvedAt: item.approved_at,
      actorKind: 'human',
    });
    if (!gate.ok) throw ApiError.badRequest(gate.reason);

    const sets = ['status = $1', 'updated_at = NOW()'];
    const params = [to];
    if (to === 'approved') {
      params.push(req.user.sub);
      sets.push(`approved_by = $${params.length}`);
      sets.push('approved_at = NOW()');
    }
    if (to === 'scheduled') {
      params.push(scheduledAt);
      sets.push(`scheduled_at = $${params.length}`);
    }
    params.push(req.params.id);
    const r = await client.query(
      `UPDATE content_items SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    await client.query(
      `INSERT INTO content_events (content_id, from_status, to_status, actor, actor_kind, note)
       VALUES ($1,$2,$3,$4,'human',$5)`,
      [req.params.id, from, to, req.user.sub, note]
    );
    return r.rows[0];
  });
  res.json({ item: itemView(out) });
};
