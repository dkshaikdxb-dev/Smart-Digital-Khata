const { query, withTx } = require('../config/db');
const logger = require('../utils/logger');
const settings = require('../config/settings');
const { writeAudit } = require('../controllers/admin.controller');

// AI-assisted content moderation, PHASE 1 (batch AI-MOD). An LLM triages the two
// owner-content review queues — storefront photos (shop_images) and owner promos
// (self-serve ad_campaigns) — that today wait for a human in 'pending_review'.
// It:
//   - is CONFIG-GATED — ships INERT and activates only when the operator sets an
//     API key AND a model id (Admin -> Settings, or the .env fallback via
//     config/settings) AND the ai_moderation_enabled platform setting is on
//     (mirrors content-drafter's isConfigured()).
//   - is MOCKABLE — every call takes an injectable client (tests pass a fake
//     exposing messages.create), so CI never touches the network.
//   - is FAIL-OPEN — any error, timeout, refusal or unparseable output returns
//     null and leaves the row exactly where it was (pending, for a human). It
//     NEVER throws to the caller and NEVER rejects content. The only status it
//     ever writes is 'active' (auto-approve), the same flip an admin approve does.
//
// The MODEL id is NEVER hardcoded — it comes from the MODERATION_LLM_MODEL
// setting (platform_settings, else env). Only the token budget and the timeout
// (plain numbers) have code defaults.

// Output budget: the verdict is a ~5-field JSON object, so keep it tight.
const DEFAULT_MAX_TOKENS = 300;
// Hard cap on one classification call. The job is fail-open, so a slow model
// simply leaves the row for a human rather than holding a worker.
const DEFAULT_TIMEOUT_MS = 20_000;

const DECISIONS = new Set(['approve', 'hold', 'review']);

// Policy thresholds: an admin may tune them within this band. Below 0.5 the
// model is guessing; the seed (0064) is 0.90 for both.
const THRESHOLD_MIN = 0.5;
const THRESHOLD_MAX = 1.0;
const DEFAULT_THRESHOLD = 0.9;

// Image media types the vision input accepts. shop_images.mime is one of these
// (the upload pipeline emits WebP with a JPEG/PNG fallback).
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

// The GUARDRAIL system prompt — a FROZEN constant. It fixes the context (Indian
// kirana / local-shop content), the categories, and the STRICT JSON contract.
const GUARDRAILS = Object.freeze(
  [
    'You are the content-moderation triage for Smart Digital Khata, a marketplace of small',
    'Indian kirana and local shops (groceries, general stores, pharmacies, tailors, repair',
    'shops, tea stalls, farm produce). Shop owners upload storefront photos and short promo',
    'texts that are shown publicly to shoppers nearby. Content may be in ANY Indian language',
    'or script (Hindi, Tamil, Telugu, Kannada, Malayalam, Urdu, Bengali, Gujarati, Marathi,',
    'Hinglish, English) — judge the meaning, not the script.',
    '',
    'Classify the content for these problems:',
    '- nudity_sexual: nudity or sexual content',
    '- violence_weapons: violence, gore, weapons',
    '- alcohol_tobacco: alcohol, tobacco, gutka, drugs (a legal wine shop still needs human review)',
    '- hate_harassment: hate, caste/religious slurs, harassment, threats',
    '- off_topic: not a shop or its goods — selfies, memes, screenshots, random unrelated images or text',
    '- misleading_offer: a deceptive, impossible or fraudulent offer or price claim',
    '- brand_misuse: a competitor or a well-known brand logo/name used as if the shop were that brand',
    '- pii: phone numbers, Aadhaar/ID numbers, or clearly visible faces of minors in the image',
    '- poor_quality: unreadable, extremely blurry, black or empty, or too poor to show publicly',
    '',
    'Decide ONE of:',
    '- "approve": clearly an ordinary shop photo or an honest local-shop promo; nothing above applies.',
    '- "hold": one or more of the problems above is clearly present — a human MUST look first.',
    '- "review": unsure, borderline, or not enough information — leave it to a human.',
    'Everyday shop content is normal: shelves, goods, signboards, prices in rupees, the shop',
    'front, the owner at the counter, festival decorations, a hand-written offer. Do not flag it.',
    '',
    'Answer with STRICT JSON ONLY — one object, no prose, no markdown fences, no comments:',
    '{"decision":"approve"|"hold"|"review","confidence":0..1,"categories":[<zero or more category',
    'ids from the list above>],"reason":"<one short sentence in the requested language>"}',
    '"confidence" is how sure you are of the decision (1 = certain).',
    'A human reviews everything you hold or leave for review. You never reject content.',
  ].join('\n')
);

// Language tag the reason sentence should be written in. The admin desk is
// English-first, so the default is 'en'; callers may pass another tag.
function reasonLang(lang) {
  const l = String(lang || '').trim().toLowerCase();
  return /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(l) ? l : 'en';
}

// The credential + model id, read THROUGH config/settings at call time so an
// admin change in the panel applies to the very next job (no restart), while
// the .env values keep working as the fallback.
function apiKey() {
  return settings.get('ANTHROPIC_API_KEY');
}
function modelId() {
  return settings.get('MODERATION_LLM_MODEL');
}

// isConfigured() — true ONLY when BOTH the API key and the model id are set
// (panel or env). Unconfigured => nothing is ever enqueued or classified and the
// rows simply wait for a human, exactly as before this batch.
function isConfigured() {
  return Boolean(apiKey() && modelId());
}

// Lazily construct the vendor SDK client. Returns null when unconfigured (so a
// caller can fall back to an injected client or skip cleanly). The client is
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

// A finite number clamped into the threshold band, or the seeded default.
function threshold(raw) {
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return DEFAULT_THRESHOLD;
  return Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, n));
}

// getPolicy() — the LIVE on/off flag + thresholds from platform_settings (0064),
// read at job time like the storefront buy-out config so an admin change applies
// to the very next job. Never throws — on any error it reports enabled:false so
// the feature stays dormant (fail-open: rows wait for a human).
//
// Returns { enabled, auto_approve_min, hold_min }.
async function getPolicy() {
  try {
    const r = await query(
      `SELECT key, value FROM platform_settings
        WHERE key IN ('ai_moderation_enabled','ai_moderation_auto_approve_min','ai_moderation_hold_min')`
    );
    const m = {};
    for (const row of r.rows) m[row.key] = row.value;
    return {
      enabled: m.ai_moderation_enabled === 'true',
      auto_approve_min: threshold(m.ai_moderation_auto_approve_min),
      hold_min: threshold(m.ai_moderation_hold_min),
    };
  } catch (_e) {
    return { enabled: false, auto_approve_min: DEFAULT_THRESHOLD, hold_min: DEFAULT_THRESHOLD };
  }
}

// configured() — the full gate: key + model (panel or env) AND the live
// ai_moderation_enabled setting. The processors check exactly this before doing
// anything, and an injected client never bypasses it.
async function configured() {
  if (!isConfigured()) return false;
  return (await getPolicy()).enabled;
}

// buildImageRequest({ mime, bytes, shopName, lang }) — PURE. One user turn: the
// photo as a base64 image block + the instruction text.
function buildImageRequest({ mime, bytes, shopName, lang } = {}) {
  const mediaType = IMAGE_MIMES.has(mime) ? mime : 'image/webp';
  const data = Buffer.isBuffer(bytes) ? bytes.toString('base64') : String(bytes || '');
  const text = [
    'Classify this storefront photo an owner uploaded for public display on their shop page.',
    `Shop name: ${shopName || '(unknown)'}`,
    `Write "reason" in language: ${reasonLang(lang)}`,
    'Reply with the JSON object only.',
  ].join('\n');
  return {
    system: GUARDRAILS,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
        { type: 'text', text },
      ],
    }],
  };
}

// buildTextRequest({ title, offerText, subtitle, shopName, lang }) — PURE. One
// user turn carrying the promo creative as labelled lines.
function buildTextRequest({ title, offerText, subtitle, shopName, lang } = {}) {
  const text = [
    'Classify this promo an owner submitted to advertise their own shop to nearby shoppers.',
    `Shop name: ${shopName || '(unknown)'}`,
    `Title: ${title || '(none)'}`,
    `Offer text: ${offerText || '(none)'}`,
    `Subtitle: ${subtitle || '(none)'}`,
    `Write "reason" in language: ${reasonLang(lang)}`,
    'Reply with the JSON object only.',
  ].join('\n');
  return {
    system: GUARDRAILS,
    messages: [{ role: 'user', content: text }],
  };
}

// parseVerdict(text) — DEFENSIVE. Extracts the first {...} object from the
// model's text, parses it, and validates the enum / number ranges. Returns the
// normalised verdict or null for anything that is not a clean verdict.
function parseVerdict(text) {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let obj;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch (_e) {
    return null;
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const decision = String(obj.decision || '').trim().toLowerCase();
  if (!DECISIONS.has(decision)) return null;
  const confidence = Number(obj.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
  const categories = Array.isArray(obj.categories)
    ? obj.categories.filter((c) => typeof c === 'string').map((c) => c.trim().slice(0, 40)).filter(Boolean).slice(0, 10)
    : [];
  const reason = typeof obj.reason === 'string' ? obj.reason.trim().slice(0, 300) : '';
  return { decision, confidence, categories, reason };
}

// The text of a response's content blocks, concatenated (same as the drafter).
function responseText(response) {
  const blocks = (response && response.content) || [];
  return blocks
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('');
}

// runClassification({ system, messages }, { client, timeoutMs }) — the ONE call
// path. Uses the injected client or the lazily-built real one; caps the request
// with a timeout; parses defensively. Returns the verdict stamped with the model
// id + timestamp, or null on ANY failure (FAIL-OPEN — never throws).
async function runClassification({ system, messages }, { client, timeoutMs } = {}) {
  let timer = null;
  try {
    const anthropic = client || getClient();
    if (!anthropic) return null;
    const maxTokens = Number(process.env.MODERATION_LLM_MAX_TOKENS) || DEFAULT_MAX_TOKENS;
    const timeout = Number(timeoutMs) || Number(process.env.MODERATION_LLM_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
    const model = modelId();
    const call = anthropic.messages.create(
      {
        model,
        max_tokens: maxTokens,
        system,
        messages,
      },
      { timeout }
    );
    const guard = new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`moderation classify timed out after ${timeout}ms`)), timeout);
    });
    const response = await Promise.race([call, guard]);
    const verdict = parseVerdict(responseText(response));
    if (!verdict) {
      logger.warn('moderation: unparseable verdict — leaving the row for a human');
      return null;
    }
    return { ...verdict, model: model || null, at: new Date().toISOString() };
  } catch (err) {
    logger.warn({ err: err && err.message }, 'moderation: classify failed — leaving the row for a human');
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// classifyImage({ mime, bytes, shopName, lang }, { client }) → verdict | null.
async function classifyImage(input, opts = {}) {
  try {
    return await runClassification(buildImageRequest(input), opts);
  } catch (_e) {
    return null;
  }
}

// classifyText({ title, offerText, subtitle, shopName, lang }, { client }) → verdict | null.
async function classifyText(input, opts = {}) {
  try {
    return await runClassification(buildTextRequest(input), opts);
  } catch (_e) {
    return null;
  }
}

// ===========================================================================
// POLICY + PROCESSORS. Pure, Redis-free: the BullMQ worker (jobs/index.js) just
// calls these, and tests call them directly. Each:
//   1. bails when not configured/enabled (row untouched, nothing written);
//   2. loads the row; no-ops unless it is still 'pending_review' with no verdict;
//   3. classifies (outside any transaction — a slow model never holds a lock);
//   4. in ONE transaction, re-locks the row, stores ai_verdict and applies the
//      live policy:
//        approve && confidence >= auto_approve_min → status 'active' (+ audit
//          ai_auto_approve, admin_user_id NULL)
//        hold && confidence >= hold_min → ai_flagged = true, STAYS pending
//          (+ audit ai_hold) — top of the admin queue
//        anything else → verdict stored only (+ audit ai_review)
//   NEVER auto-rejects. Any failure is logged and leaves the row pending.
// ===========================================================================

// Which policy branch a verdict lands in under the live thresholds.
function decideOutcome(verdict, policy) {
  if (verdict.decision === 'approve' && verdict.confidence >= policy.auto_approve_min) return 'auto_approve';
  if (verdict.decision === 'hold' && verdict.confidence >= policy.hold_min) return 'hold';
  return 'review';
}

const OUTCOME_ACTION = { auto_approve: 'ai_auto_approve', hold: 'ai_hold', review: 'ai_review' };

// moderateShopImage(imageId, { client }) → { outcome } | { skipped }.
async function moderateShopImage(imageId, { client } = {}) {
  try {
    if (!(await configured())) return { skipped: 'not_configured' };
    const pre = await query(
      `SELECT i.id, i.shop_id, i.status, i.mime, i.data, i.ai_verdict, s.name AS shop_name
         FROM shop_images i JOIN shops s ON s.id = i.shop_id
        WHERE i.id = $1`,
      [imageId]
    );
    if (!pre.rowCount) return { skipped: 'not_found' };
    const row = pre.rows[0];
    if (row.status !== 'pending_review' || row.ai_verdict) return { skipped: 'not_pending' };

    const verdict = await classifyImage(
      { mime: row.mime, bytes: row.data, shopName: row.shop_name, lang: 'en' },
      { client }
    );
    if (!verdict) return { skipped: 'no_verdict' };

    const policy = await getPolicy();
    const outcome = decideOutcome(verdict, policy);

    const applied = await withTx(async (c) => {
      const locked = await c.query(
        'SELECT status, ai_verdict FROM shop_images WHERE id = $1 FOR UPDATE',
        [imageId]
      );
      // An admin may have acted while the model was thinking — never overwrite.
      if (!locked.rowCount || locked.rows[0].status !== 'pending_review' || locked.rows[0].ai_verdict) return false;
      if (outcome === 'auto_approve') {
        await c.query(
          `UPDATE shop_images
              SET status = 'active', reviewed_at = NOW(), ai_verdict = $2::jsonb, ai_flagged = false
            WHERE id = $1`,
          [imageId, JSON.stringify(verdict)]
        );
      } else {
        await c.query(
          'UPDATE shop_images SET ai_verdict = $2::jsonb, ai_flagged = $3 WHERE id = $1',
          [imageId, JSON.stringify(verdict), outcome === 'hold']
        );
      }
      await writeAudit({
        adminUserId: null,
        action: OUTCOME_ACTION[outcome],
        targetType: 'shop',
        targetId: row.shop_id,
        reason: verdict.reason || null,
        metadata: { image_id: row.id, ...verdict },
        client: c,
      });
      return true;
    });
    if (!applied) return { skipped: 'raced' };
    logger.info({ image_id: imageId, outcome, confidence: verdict.confidence }, 'moderation: photo triaged');
    return { outcome };
  } catch (err) {
    logger.error({ err: err && err.message, image_id: imageId }, 'moderation: photo job failed — row left pending');
    return { skipped: 'error' };
  }
}

// moderateCampaign(campaignId, { client }) → { outcome } | { skipped }. Only a
// self-serve (owner) promo is ever triaged; admin-authored campaigns are not
// moderated content.
async function moderateCampaign(campaignId, { client } = {}) {
  try {
    if (!(await configured())) return { skipped: 'not_configured' };
    const pre = await query(
      `SELECT c.id, c.link_shop_id, c.status, c.self_serve, c.title, c.offer_text, c.subtitle,
              c.ai_verdict, s.name AS shop_name
         FROM ad_campaigns c LEFT JOIN shops s ON s.id = c.link_shop_id
        WHERE c.id = $1`,
      [campaignId]
    );
    if (!pre.rowCount) return { skipped: 'not_found' };
    const row = pre.rows[0];
    if (!row.self_serve || row.status !== 'pending_review' || row.ai_verdict) return { skipped: 'not_pending' };

    const verdict = await classifyText(
      { title: row.title, offerText: row.offer_text, subtitle: row.subtitle, shopName: row.shop_name, lang: 'en' },
      { client }
    );
    if (!verdict) return { skipped: 'no_verdict' };

    const policy = await getPolicy();
    const outcome = decideOutcome(verdict, policy);

    const applied = await withTx(async (c) => {
      const locked = await c.query(
        'SELECT status, ai_verdict FROM ad_campaigns WHERE id = $1 FOR UPDATE',
        [campaignId]
      );
      if (!locked.rowCount || locked.rows[0].status !== 'pending_review' || locked.rows[0].ai_verdict) return false;
      if (outcome === 'auto_approve') {
        await c.query(
          `UPDATE ad_campaigns
              SET status = 'active', ai_verdict = $2::jsonb, ai_flagged = false, updated_at = NOW()
            WHERE id = $1`,
          [campaignId, JSON.stringify(verdict)]
        );
      } else {
        await c.query(
          'UPDATE ad_campaigns SET ai_verdict = $2::jsonb, ai_flagged = $3, updated_at = NOW() WHERE id = $1',
          [campaignId, JSON.stringify(verdict), outcome === 'hold']
        );
      }
      await writeAudit({
        adminUserId: null,
        action: OUTCOME_ACTION[outcome],
        targetType: 'campaign',
        targetId: row.id,
        reason: verdict.reason || null,
        metadata: { shop_id: row.link_shop_id, ...verdict },
        client: c,
      });
      return true;
    });
    if (!applied) return { skipped: 'raced' };
    logger.info({ campaign_id: campaignId, outcome, confidence: verdict.confidence }, 'moderation: promo triaged');
    return { outcome };
  } catch (err) {
    logger.error({ err: err && err.message, campaign_id: campaignId }, 'moderation: promo job failed — row left pending');
    return { skipped: 'error' };
  }
}

// ---- Triggers --------------------------------------------------------------
// Called by the upload / promo-submit controllers AFTER their transaction has
// committed. Fire-and-forget: the HTTP response never waits on Redis, and an
// enqueue failure is logged, never surfaced (the row simply waits for a human).
// Skipped entirely when the key + model are not configured, so nothing touches
// the queue (or Redis) on a deployment that has not switched the feature on.
function enqueue(kind, id) {
  if (!isConfigured()) return;
  try {
    // Lazy require: the queue module opens the Redis connection on load.
    const { enqueueModeration } = require('../jobs');
    Promise.resolve(enqueueModeration(kind, id)).catch((err) => {
      logger.warn({ err: err && err.message, kind, id }, 'moderation: enqueue failed — row waits for a human');
    });
  } catch (err) {
    logger.warn({ err: err && err.message, kind, id }, 'moderation: enqueue failed — row waits for a human');
  }
}
const enqueueShopImage = (imageId) => enqueue('shop_image', imageId);
const enqueueCampaign = (campaignId) => enqueue('campaign', campaignId);

module.exports = {
  isConfigured,
  configured,
  getClient,
  getPolicy,
  buildImageRequest,
  buildTextRequest,
  parseVerdict,
  classifyImage,
  classifyText,
  moderateShopImage,
  moderateCampaign,
  enqueueShopImage,
  enqueueCampaign,
  // exported for tests / introspection
  decideOutcome,
  GUARDRAILS,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TIMEOUT_MS,
  THRESHOLD_MIN,
  THRESHOLD_MAX,
};
