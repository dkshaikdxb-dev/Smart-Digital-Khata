const { query } = require('../config/db');

// Public, anonymous product-event ingest. Privacy-first: we accept ONLY the
// allowlisted event names and a small set of low-cardinality marketing fields,
// store NO PII (no ip/ua/name/email/phone), truncate every string, and cap the
// free-form `props` blob. The endpoint is deliberately defensive — it never
// throws on malformed input; bad rows are dropped and the response is always
// 202 { accepted: <rows inserted> }.

// Only these four events are recorded; anything else is silently dropped.
const ALLOWED_NAMES = new Set([
  'landing_view',
  'get_app_click',
  'register_start',
  'register_complete',
]);

// Per-field truncation caps (chars), matching the frozen contract.
const CAP_UTM = 120;        // utm_source/medium/campaign/term/content
const CAP_HOST = 190;       // referrer_host
const CAP_PATH = 190;       // path
const CAP_SESSION = 64;     // session_id
const MAX_EVENTS = 20;      // clamp the batch
const PROPS_MAX_BYTES = 1024; // <=1KB serialized props

// Coerce to a trimmed string capped at `max` chars, or null when absent/blank.
function str(v, max) {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') {
    if (typeof v === 'number' || typeof v === 'boolean') v = String(v);
    else return null;
  }
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

// Parse an ISO-8601 timestamp; fall back to now() (returned as null so the
// column DEFAULT applies) when missing or invalid.
function parseTs(v) {
  if (typeof v !== 'string' || !v.trim()) return null;
  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

// Keep `props` only when it is a small plain object that serializes under the
// byte cap. Arrays, primitives, and oversized blobs are dropped (stored NULL).
function sanitizeProps(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  let json;
  try {
    json = JSON.stringify(v);
  } catch (_e) {
    return null;
  }
  if (!json || json === '{}') return null;
  if (Buffer.byteLength(json, 'utf8') > PROPS_MAX_BYTES) return null;
  return json;
}

exports.ingest = async (req, res) => {
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const sessionId = str(body.session_id, CAP_SESSION);
  const rawEvents = Array.isArray(body.events) ? body.events.slice(0, MAX_EVENTS) : [];

  const rows = [];
  for (const ev of rawEvents) {
    if (!ev || typeof ev !== 'object') continue;
    const name = typeof ev.name === 'string' ? ev.name.trim() : '';
    if (!ALLOWED_NAMES.has(name)) continue; // drop unknown names silently

    const utm = (ev.utm && typeof ev.utm === 'object' && !Array.isArray(ev.utm)) ? ev.utm : {};
    rows.push({
      event_name: name,
      session_id: sessionId,
      ts: parseTs(ev.ts),
      utm_source: str(utm.source, CAP_UTM),
      utm_medium: str(utm.medium, CAP_UTM),
      utm_campaign: str(utm.campaign, CAP_UTM),
      utm_term: str(utm.term, CAP_UTM),
      utm_content: str(utm.content, CAP_UTM),
      referrer_host: str(ev.referrer_host, CAP_HOST),
      path: str(ev.path, CAP_PATH),
      props: sanitizeProps(ev.props),
    });
  }

  if (rows.length === 0) {
    return res.status(202).json({ accepted: 0 });
  }

  // One parameterized multi-row INSERT. `ts` is passed as text/NULL and cast to
  // timestamptz; a NULL ts falls back to the column DEFAULT now() via COALESCE.
  const cols = 11;
  const params = [];
  const tuples = rows.map((r, i) => {
    const b = i * cols;
    params.push(
      r.event_name, r.session_id, r.ts, r.utm_source, r.utm_medium,
      r.utm_campaign, r.utm_term, r.utm_content, r.referrer_host, r.path, r.props
    );
    return `($${b + 1}, $${b + 2}, COALESCE($${b + 3}::timestamptz, NOW()), $${b + 4}, $${b + 5}, `
      + `$${b + 6}, $${b + 7}, $${b + 8}, $${b + 9}, $${b + 10}, $${b + 11}::jsonb)`;
  });

  const sql =
    `INSERT INTO analytics_events
       (event_name, session_id, ts, utm_source, utm_medium, utm_campaign,
        utm_term, utm_content, referrer_host, path, props)
     VALUES ${tuples.join(', ')}`;

  try {
    const result = await query(sql, params);
    return res.status(202).json({ accepted: result.rowCount });
  } catch (_err) {
    // Never surface a 500 for anonymous ingest — degrade to accepted: 0.
    return res.status(202).json({ accepted: 0 });
  }
};
