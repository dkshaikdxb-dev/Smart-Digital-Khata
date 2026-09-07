const crypto = require('crypto');
const { query } = require('../config/db');
const logger = require('../utils/logger');

// Real BLOG publisher (Batch T) — INTERNAL, no external credentials, ships fully
// working. Publishing a `blog` content item INSERTs a public blog_posts row that
// the marketing site renders at /blog and /blog/<slug>. Deterministic and makes
// NO network call, so it is ALWAYS "publishConfigured" — the publisher resolves
// this adapter for the `blog` channel unconditionally.
//
// The public read side (listPosts/getPost) returns only published posts and, for
// the list, only minimal fields. Post bodies are rendered by the site as SAFE
// text/paragraphs (never as HTML), so nothing here needs to sanitize markup.

const MAX_SLUG_ATTEMPTS = 6;
const SLUG_MAX_LEN = 80;

// slugify(input) — lowercase, ASCII, hyphenated. Diacritics are folded; every
// run of non-[a-z0-9] collapses to a single hyphen; leading/trailing hyphens are
// trimmed and the result is capped. Returns '' when the input has no ASCII
// alphanumerics (e.g. a purely Devanagari title) — the caller then falls back.
function slugify(input) {
  return (input == null ? '' : String(input))
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LEN)
    .replace(/-+$/g, '');
}

// The first non-empty line of a body, trimmed and capped — used as a title when
// the item has none.
function firstLine(body) {
  const line = (body == null ? '' : String(body))
    .split('\n')
    .map((s) => s.trim())
    .find(Boolean) || '';
  return line.slice(0, 200);
}

// A short random suffix appended on slug collision.
function shortSuffix() {
  return crypto.randomBytes(3).toString('hex'); // 6 hex chars
}

// A candidate slug for the Nth attempt: the base first, then base-<suffix>.
function slugCandidate(base, attempt) {
  return attempt === 0 ? base : `${base}-${shortSuffix()}`;
}

// Derive the title + base slug for a content item.
function deriveTitleAndSlug(item) {
  const body = item && item.body != null ? String(item.body) : '';
  const rawTitle = (item && item.title && String(item.title).trim()) || firstLine(body) || 'Untitled';
  const base = slugify(rawTitle) || slugify(body) || slugify(item && item.id) || 'post';
  return { title: rawTitle, base };
}

// The blog adapter the publisher calls at send time. Mirrors the outbox/social
// adapter contract: send(item) returns { result:'sent', externalRef, detail } or
// { result:'failed', detail }. It performs a single INSERT (no network, no held
// tx) and returns the public path as the external ref. On a slug UNIQUE
// collision it retries with a fresh short suffix (de-duplication). The
// publisher's FINALIZE step writes the content_publish_log row.
const blogAdapter = Object.freeze({
  name: 'blog',
  async send(item) {
    if (!item) return { result: 'failed', detail: 'no item to publish' };
    const { title, base } = deriveTitleAndSlug(item);
    const body = item.body != null ? String(item.body) : '';
    const language = (item.language && String(item.language)) || 'en';

    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
      const slug = slugCandidate(base, attempt);
      try {
        await query(
          `INSERT INTO blog_posts (content_id, slug, title, body, language)
           VALUES ($1,$2,$3,$4,$5)`,
          [item.id || null, slug, title, body, language]
        );
        return { result: 'sent', externalRef: `/blog/${slug}`, detail: 'published to blog' };
      } catch (err) {
        // 23505 = unique_violation → the slug is taken; retry with a new suffix.
        if (err && err.code === '23505') continue;
        logger.error({ err: err && err.message }, 'blog publish insert failed');
        return { result: 'failed', detail: 'blog insert failed' };
      }
    }
    return { result: 'failed', detail: 'could not allocate a unique slug' };
  },
});

// The publisher's config-gated registry (mirrors content-social.ADAPTERS). Blog
// is internal and always available.
const ADAPTERS = Object.freeze({ blog: blogAdapter });

// publishConfigured(channel) — the blog channel is ALWAYS configured (no creds).
function publishConfigured(channel) {
  return channel === 'blog';
}

// ---------------------------------------------------------------------------
// Public read side
// ---------------------------------------------------------------------------
// Published posts, newest first, minimal fields (no body). `limit` is clamped;
// an optional `lang` filters by language.
async function listPosts({ limit, lang } = {}) {
  const lim = Math.min(100, Math.max(1, Number(limit) || 20));
  const params = [];
  let where = 'is_published = true';
  if (lang) {
    params.push(String(lang));
    where += ` AND language = $${params.length}`;
  }
  params.push(lim);
  const r = await query(
    `SELECT slug, title, language, published_at
     FROM blog_posts
     WHERE ${where}
     ORDER BY published_at DESC
     LIMIT $${params.length}`,
    params
  );
  return r.rows;
}

// One published post by slug, or null. Includes the body for the detail page.
async function getPost(slug) {
  if (!slug) return null;
  const r = await query(
    `SELECT slug, title, body, language, published_at
     FROM blog_posts
     WHERE slug = $1 AND is_published = true
     LIMIT 1`,
    [String(slug)]
  );
  return r.rows[0] || null;
}

module.exports = {
  slugify,
  firstLine,
  deriveTitleAndSlug,
  blogAdapter,
  ADAPTERS,
  publishConfigured,
  listPosts,
  getPost,
};
