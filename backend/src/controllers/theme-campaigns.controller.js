const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { normalizeHex, contrastReport } = require('../utils/contrast');

// Admin CRUD for the festive accent windows (batch THEME1). Routes live in
// admin.routes.js under /api/admin/theme/campaigns, gated per-verb the same way
// the referral campaigns are: reads with 'revenue:view', writes with
// 'settings:manage'.
//
// A window OVERRIDES platform_settings.theme_accent while it is active and NOW()
// sits inside its dates. Nothing here decides WHICH window wins — that is
// utils/theme.resolveAccent, which /public/config calls, and it is the only
// place that rule exists.
//
// Simpler than referral campaigns in two ways, both deliberate: no budget,
// because a colour costs nothing, and no geo targets, because the consumer
// app's own chrome belongs to no shop and so has no town whose festival it
// could follow. See migration 0076.

const SELECT = `
  SELECT id, name, accent, status, starts_at, ends_at, priority,
         created_by, created_at, updated_at,
         (status = 'active'
          AND (starts_at IS NULL OR starts_at <= NOW())
          AND (ends_at   IS NULL OR ends_at   >= NOW())) AS is_live
  FROM theme_campaigns`;

// Every row carries what its colour will read like, so the list can warn without
// the client doing the maths. Same report the Appearance panel shows.
const shape = (row) => (row ? { ...row, contrast: contrastReport(row.accent) } : row);

const STATUSES = ['draft', 'active', 'paused', 'ended'];

function validateBody(b) {
  const name = String(b.name == null ? '' : b.name).trim();
  if (!name) throw ApiError.badRequest('name_required');

  // A malformed colour is refused outright — the same rule the standing accent
  // follows, and for the same reason: an admin must never walk away believing
  // they saved something that was quietly dropped. POOR CONTRAST IS NOT refused;
  // the report rides back on every read so the panel can warn.
  const accent = normalizeHex(b.accent);
  if (!accent) throw ApiError.badRequest('invalid_accent');

  const status = b.status == null ? 'draft' : String(b.status);
  if (!STATUSES.includes(status)) throw ApiError.badRequest('invalid_status');

  const when = (v) => {
    if (v == null || v === '') return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) throw ApiError.badRequest('invalid_date');
    return d.toISOString();
  };
  const starts_at = when(b.starts_at);
  const ends_at = when(b.ends_at);
  // A window that ends before it starts would never paint, and saving it
  // silently is how somebody spends a festival wondering why nothing happened.
  if (starts_at && ends_at && new Date(ends_at) < new Date(starts_at)) {
    throw ApiError.badRequest('ends_before_starts');
  }

  const priority = b.priority == null ? 0 : parseInt(b.priority, 10);
  if (!Number.isInteger(priority)) throw ApiError.badRequest('invalid_priority');

  return { name, accent, status, starts_at, ends_at, priority };
}

// GET /api/admin/theme/campaigns
exports.list = async (req, res) => {
  const params = [];
  const where = [];
  if (req.query.status) { params.push(req.query.status); where.push(`status = $${params.length}`); }
  const r = await query(
    `${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY priority DESC, created_at DESC LIMIT 500`,
    params,
  );
  res.json({ items: r.rows.map(shape) });
};

// GET /api/admin/theme/campaigns/:id
exports.getOne = async (req, res) => {
  const r = await query(`${SELECT} WHERE id = $1`, [req.params.id]);
  if (!r.rowCount) throw ApiError.notFound('Theme not found');
  res.json({ campaign: shape(r.rows[0]) });
};

// POST /api/admin/theme/campaigns
exports.create = async (req, res) => {
  const v = validateBody(req.body);
  const r = await query(
    `INSERT INTO theme_campaigns (name, accent, status, starts_at, ends_at, priority, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [v.name, v.accent, v.status, v.starts_at, v.ends_at, v.priority, req.user ? req.user.id : null],
  );
  const got = await query(`${SELECT} WHERE id = $1`, [r.rows[0].id]);
  res.status(201).json({ campaign: shape(got.rows[0]) });
};

// PUT /api/admin/theme/campaigns/:id
exports.update = async (req, res) => {
  const v = validateBody(req.body);
  const r = await query(
    `UPDATE theme_campaigns
        SET name=$1, accent=$2, status=$3, starts_at=$4, ends_at=$5, priority=$6, updated_at=NOW()
      WHERE id=$7 RETURNING id`,
    [v.name, v.accent, v.status, v.starts_at, v.ends_at, v.priority, req.params.id],
  );
  if (!r.rowCount) throw ApiError.notFound('Theme not found');
  const got = await query(`${SELECT} WHERE id = $1`, [req.params.id]);
  res.json({ campaign: shape(got.rows[0]) });
};

// PATCH /api/admin/theme/campaigns/:id/status — the one-click pause a live
// window needs, without re-sending everything else about it.
exports.setStatus = async (req, res) => {
  const status = String(req.body.status || '');
  if (!STATUSES.includes(status)) throw ApiError.badRequest('invalid_status');
  const r = await query(
    `UPDATE theme_campaigns SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING id`,
    [status, req.params.id],
  );
  if (!r.rowCount) throw ApiError.notFound('Theme not found');
  const got = await query(`${SELECT} WHERE id = $1`, [req.params.id]);
  res.json({ campaign: shape(got.rows[0]) });
};

// DELETE /api/admin/theme/campaigns/:id
exports.remove = async (req, res) => {
  const r = await query('DELETE FROM theme_campaigns WHERE id = $1 RETURNING id', [req.params.id]);
  if (!r.rowCount) throw ApiError.notFound('Theme not found');
  res.json({ ok: true });
};
