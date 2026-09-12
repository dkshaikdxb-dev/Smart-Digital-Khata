const { query, withTx } = require('../config/db');
const ApiError = require('../utils/ApiError');
const settings = require('../config/settings');
const { canTransition } = require('../utils/content-workflow');

// LLM drafting agent for the content engine (Batch R). Given an editorial brief
// (an 'idea' or 'draft' item), it produces the post `body`, advancing the item
// idea -> drafting -> draft with source='agent'. It:
//   - is CONFIG-GATED — ships INERT and activates only when the operator sets an
//     API key AND a model id — from Admin -> Settings or the .env fallback, via
//     config/settings (mirrors whatsapp.service's isConfigured()/graceful-skip
//     convention);
//   - is MOCKABLE — every call takes an injectable client, so tests never touch
//     the network (CI stays offline);
//   - stays BEHIND THE HUMAN GATE — runDraft only ever reaches 'draft'. It NEVER
//     sets approved_*/scheduled/published, so the tier gate (content-workflow) is
//     untouched. A human still reviews and approves everything before it ships.
//
// The MODEL id is NEVER hardcoded — it comes from the CONTENT_LLM_MODEL setting
// (platform_settings, else env). Only the token budget (a plain number, not a
// model id) has a code default.

// Default output token budget when CONTENT_LLM_MAX_TOKENS is unset. A number, not
// a model identifier — safe to default in code.
const DEFAULT_MAX_TOKENS = 4000;

// The GUARDRAIL system prompt — a FROZEN constant. It fixes the audience, voice
// and the hard "never" rules the drafter must obey. buildRequest() appends the
// per-item context (channel/engine/tier/language) but never weakens these rules.
const GUARDRAILS = Object.freeze(
  [
    'You are the drafting agent for Smart Digital Khata, a digital-ledger (bahi-khata) app',
    'for rural Indian kirana shopkeepers who often have low literacy and use cheap phones.',
    'You draft one social, blog, newsletter or WhatsApp post at a time for a human editor.',
    '',
    'Voice: warm, plain, respectful and practical. Short sentences. Everyday words a shop',
    'owner understands. Never talk down to the reader.',
    '',
    'Hard rules — follow every one:',
    '- Write the post in the target LANGUAGE given below, and only that language.',
    '- Ground the post ONLY in the provided brief. Do NOT invent anything beyond it.',
    '- NEVER fabricate statistics, numbers, names, quotes or testimonials. If the brief',
    '  gives no figure, use none. Made-up testimonials are forbidden.',
    '- NEVER promise or imply guaranteed returns, profit or savings, and NEVER frame the',
    '  post as financial, investment or credit advice (Indian financial-marketing rules).',
    '- NEVER encourage over-borrowing, over-lending or overspending. Keep money guidance',
    '  cautious and respectful of the reader\'s livelihood.',
    '- Output ONLY the post body itself — no preamble, no explanation, no meta commentary,',
    '  no channel labels, no surrounding quotes.',
    '',
    'A human editor reviews everything you write before it is ever published. Nothing you',
    'produce is published automatically.',
  ].join('\n')
);

// The credential + model id, read THROUGH config/settings at call time so an
// admin change in the panel applies to the next draft (no restart), while the
// .env values keep working as the fallback.
function apiKey() {
  return settings.get('ANTHROPIC_API_KEY');
}
function modelId() {
  return settings.get('CONTENT_LLM_MODEL');
}

// isConfigured() — true ONLY when BOTH the API key and the model are set (panel
// or env). Mirrors whatsapp.service.isConfigured(): unconfigured => the feature
// is inert and the caller skips gracefully (the route answers 400, the desk
// shows "not configured"). The secret key is never returned or logged.
function isConfigured() {
  return Boolean(apiKey() && modelId());
}

// Lazily construct the vendor SDK client. Returns null when unconfigured (so a
// caller can fall back to an injected client or fail cleanly). The client is
// cached KEYED BY THE API KEY STRING: when the admin rotates the key the next
// call builds a fresh client, so a stale credential is never reused.
let cachedClient = null;
let cachedClientKey = null;
function getClient() {
  if (!isConfigured()) return null;
  const key = apiKey();
  if (!cachedClient || cachedClientKey !== key) {
    // Documented CommonJS import. Depending on the installed build, require()
    // returns the class directly or under `.default`; handle both.
    const imported = require('@anthropic-ai/sdk');
    const Anthropic = imported && imported.default ? imported.default : imported;
    cachedClient = new Anthropic({ apiKey: key });
    cachedClientKey = key;
  }
  return cachedClient;
}

// buildRequest(item) — PURE and deterministic. Returns { system, messages } for
// the SDK call. `system` is the frozen guardrail prompt plus this item's
// channel/engine/tier/language context (so the format fits and the target
// language is named); `messages` is one user turn carrying the brief + title.
function buildRequest(item) {
  const language = (item && item.language) || 'en';
  const channel = (item && item.channel) || '';
  const engine = (item && item.engine) || '';
  const tier = item && item.autonomy_tier != null ? item.autonomy_tier : '';
  const title = (item && item.title) || '';
  const brief = (item && item.brief) || '';

  const system = [
    GUARDRAILS,
    '',
    'This item:',
    `- Channel: ${channel} (format the post for this channel).`,
    `- Engine: ${engine} (record = document what is real; reach = grow the audience).`,
    `- Autonomy tier: ${tier}.`,
    `- Target language: ${language} — write the post in ${language}.`,
  ].join('\n');

  const userText = [
    `Title: ${title || '(none — you may craft a fitting one inline)'}`,
    `Channel: ${channel}`,
    `Target language: ${language}`,
    '',
    'Brief (ground the post ONLY in this — invent nothing beyond it):',
    brief || '(no brief provided)',
  ].join('\n');

  return {
    system,
    messages: [{ role: 'user', content: userText }],
  };
}

// draftItem(item, { client }) — run one generation and return the trimmed body.
// Uses the injected client (tests pass a fake exposing messages.create) or the
// lazily-built real client. Throws when neither is available (unconfigured and no
// injection) so nothing silently no-ops. The model comes from settings, the
// token budget from the environment; buildRequest supplies the guardrails.
async function draftItem(item, { client } = {}) {
  const anthropic = client || getClient();
  if (!anthropic) {
    throw ApiError.badRequest('AI drafting is not configured');
  }
  const { system, messages } = buildRequest(item);
  const maxTokens = Number(process.env.CONTENT_LLM_MAX_TOKENS) || DEFAULT_MAX_TOKENS;
  const response = await anthropic.messages.create({
    model: modelId(),
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    system,
    messages,
  });
  const blocks = (response && response.content) || [];
  const text = blocks
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('');
  return text.trim();
}

// runDraft(itemId, { client }) — the agent's one job. It:
//   1. loads the item; it MUST be in 'idea', 'drafting' or 'draft' (else ApiError).
//      'idea'/'draft' is the direct entry point; 'drafting' is the state the API
//      route parks the item in before enqueuing, so the worker resumes from there.
//   2. drafts the body (draftItem);
//   3. in ONE transaction: writes body, source='agent', meta.draft_model, and
//      advances idea -> drafting -> draft via canTransition, writing a
//      content_events row (actor_kind 'agent') per transition.
// It NEVER writes approved_*/scheduled_at/published_* — the human gate is intact.
async function runDraft(itemId, { client } = {}) {
  const pre = await query('SELECT * FROM content_items WHERE id = $1', [itemId]);
  if (!pre.rowCount) throw ApiError.notFound('Content item not found');
  const preStatus = pre.rows[0].status;
  if (!['idea', 'drafting', 'draft'].includes(preStatus)) {
    throw ApiError.badRequest(`Cannot draft an item in status '${preStatus}'`);
  }

  // Generate outside the transaction so a slow model never holds a DB lock open.
  const body = await draftItem(pre.rows[0], { client });
  const draftModel = modelId() || null;

  return withTx(async (c) => {
    const locked = await c.query('SELECT * FROM content_items WHERE id = $1 FOR UPDATE', [itemId]);
    if (!locked.rowCount) throw ApiError.notFound('Content item not found');
    const row = locked.rows[0];
    const from = row.status;
    if (!['idea', 'drafting', 'draft'].includes(from)) {
      throw ApiError.badRequest(`Cannot draft an item in status '${from}'`);
    }

    // The forward path to 'draft'. 'idea' walks idea->drafting->draft; 'drafting'
    // finishes drafting->draft; an existing 'draft' is a re-draft (no move, body
    // refreshed). Every step is validated by canTransition — no gate is crossed.
    const path = [];
    if (from === 'idea') { path.push(['idea', 'drafting'], ['drafting', 'draft']); }
    else if (from === 'drafting') { path.push(['drafting', 'draft']); }
    for (const [f, t] of path) {
      if (!canTransition(f, t)) throw ApiError.badRequest(`Illegal transition ${f} -> ${t}`);
    }

    const meta = Object.assign({}, row.meta || {}, { draft_model: draftModel });
    const updated = await c.query(
      `UPDATE content_items
       SET body = $1, source = 'agent', status = 'draft', meta = $2::jsonb, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [body, JSON.stringify(meta), itemId]
    );
    for (const [f, t] of path) {
      await c.query(
        `INSERT INTO content_events (content_id, from_status, to_status, actor, actor_kind, note)
         VALUES ($1,$2,$3,NULL,'agent',$4)`,
        [itemId, f, t, 'drafted by AI agent']
      );
    }
    return updated.rows[0];
  });
}

module.exports = {
  isConfigured,
  getClient,
  buildRequest,
  draftItem,
  runDraft,
  // exported for tests / introspection
  GUARDRAILS,
  DEFAULT_MAX_TOKENS,
};
