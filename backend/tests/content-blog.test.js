// Real internal BLOG publisher (Batch T). Requires a real Postgres
// (DATABASE_URL, migrations 0001..0032). NO network is ever made. Covers:
//   1. slugify: lowercase/ASCII/hyphenated + non-ASCII fallback.
//   2. blogAdapter.send inserts a published blog_posts row and returns
//      /blog/<slug>; a colliding title gets a suffixed slug.
//   3. GET /api/public/blog lists published posts (minimal fields); /blog/:slug
//      returns one (with body); an unknown / unpublished slug → 404.
//   4. publishDue on a scheduled+due Tier-0 `blog` item creates the post, marks
//      the item published, and logs the real `blog` adapter name.
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'testsecret';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const blog = require('../src/services/content-blog.service');
const publisher = require('../src/services/content-publisher.service');

const uniq = Date.now().toString().slice(-9);
const createdContentIds = [];
const createdSlugs = [];

// Insert a content item. Defaults to a NON-scheduled draft (so publishDue never
// claims it) — the publishDue test overrides status/scheduled_at explicitly.
async function insertItem(over = {}) {
  const o = {
    channel: 'blog', engine: 'record', autonomy_tier: 0, language: 'en',
    title: 'T', body: 'B', status: 'draft', scheduled_at: null,
    approved_at: null, approved_by: null, source: 'human',
    ...over,
  };
  const r = await pool.query(
    `INSERT INTO content_items (channel, engine, autonomy_tier, language, title, body, status, scheduled_at, approved_at, approved_by, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [o.channel, o.engine, o.autonomy_tier, o.language, o.title, o.body, o.status, o.scheduled_at, o.approved_at, o.approved_by, o.source]
  );
  createdContentIds.push(r.rows[0].id);
  return r.rows[0];
}

const slugOf = (ref) => String(ref).replace('/blog/', '');

afterAll(async () => {
  if (createdSlugs.length) {
    await pool.query('DELETE FROM blog_posts WHERE slug = ANY($1)', [createdSlugs]);
  }
  if (createdContentIds.length) {
    await pool.query('DELETE FROM blog_posts WHERE content_id = ANY($1)', [createdContentIds]);
    await pool.query('DELETE FROM content_items WHERE id = ANY($1)', [createdContentIds]);
  }
  await pool.end();
});

// ---------------------------------------------------------------------------
// 1. slugify
// ---------------------------------------------------------------------------
describe('slugify', () => {
  it('lowercases, folds diacritics, and hyphenates to ASCII', () => {
    expect(blog.slugify('Hello, Bharat Shops!')).toBe('hello-bharat-shops');
    expect(blog.slugify('  Café  Déjà Vu  ')).toBe('cafe-deja-vu');
    expect(blog.slugify('A/B & C--D')).toBe('a-b-c-d');
  });
  it('returns empty for a purely non-ASCII title (caller then falls back)', () => {
    expect(blog.slugify('आपकी दुकान')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 2. blogAdapter.send
// ---------------------------------------------------------------------------
describe('blogAdapter.send', () => {
  it('inserts a published post and returns /blog/<slug>', async () => {
    const item = await insertItem({ title: `Hello Bharat Shops ${uniq}`, body: 'Body one' });
    const out = await blog.blogAdapter.send(item);
    expect(out.result).toBe('sent');
    const expectedSlug = `hello-bharat-shops-${uniq}`;
    expect(out.externalRef).toBe(`/blog/${expectedSlug}`);
    createdSlugs.push(expectedSlug);

    const r = await pool.query('SELECT * FROM blog_posts WHERE slug = $1', [expectedSlug]);
    expect(r.rowCount).toBe(1);
    expect(r.rows[0].content_id).toBe(item.id);
    expect(r.rows[0].title).toBe(`Hello Bharat Shops ${uniq}`);
    expect(r.rows[0].is_published).toBe(true);
  });

  it('a colliding title gets a distinct, suffixed slug', async () => {
    const a = await insertItem({ title: `Same Title ${uniq}`, body: 'A' });
    const b = await insertItem({ title: `Same Title ${uniq}`, body: 'B' });
    const o1 = await blog.blogAdapter.send(a);
    const o2 = await blog.blogAdapter.send(b);
    createdSlugs.push(slugOf(o1.externalRef), slugOf(o2.externalRef));

    const base = `same-title-${uniq}`;
    expect(o1.externalRef).toBe(`/blog/${base}`);
    expect(o2.externalRef).not.toBe(o1.externalRef);
    expect(o2.externalRef.startsWith(`/blog/${base}-`)).toBe(true);
  });

  it('uses the first line of the body as the title when the item has none', async () => {
    const item = await insertItem({ title: null, body: `First line title ${uniq}\n\nMore body` });
    const out = await blog.blogAdapter.send(item);
    createdSlugs.push(slugOf(out.externalRef));
    const r = await pool.query('SELECT title FROM blog_posts WHERE slug = $1', [slugOf(out.externalRef)]);
    expect(r.rows[0].title).toBe(`First line title ${uniq}`);
  });
});

// ---------------------------------------------------------------------------
// 3. Public read endpoints
// ---------------------------------------------------------------------------
describe('public blog endpoints', () => {
  it('GET /api/public/blog lists published posts (minimal fields, no body)', async () => {
    const item = await insertItem({ title: `Reader Post ${uniq}`, body: 'Para one\n\nPara two' });
    await blog.blogAdapter.send(item);
    const slug = `reader-post-${uniq}`;
    createdSlugs.push(slug);

    const res = await request(app).get('/api/public/blog?limit=100');
    expect(res.status).toBe(200);
    const found = res.body.posts.find((p) => p.slug === slug);
    expect(found).toBeTruthy();
    expect(found.title).toBe(`Reader Post ${uniq}`);
    // The list projection carries no body.
    expect(found.body).toBeUndefined();
  });

  it('GET /api/public/blog/:slug returns one post with its body', async () => {
    const item = await insertItem({ title: `Detail Post ${uniq}`, body: 'Paragraph alpha\n\nParagraph beta' });
    await blog.blogAdapter.send(item);
    const slug = `detail-post-${uniq}`;
    createdSlugs.push(slug);

    const res = await request(app).get(`/api/public/blog/${slug}`);
    expect(res.status).toBe(200);
    expect(res.body.post.slug).toBe(slug);
    expect(res.body.post.body).toContain('Paragraph alpha');
  });

  it('an unknown slug → 404, and an unpublished post → 404', async () => {
    const unknown = await request(app).get(`/api/public/blog/does-not-exist-${uniq}`);
    expect(unknown.status).toBe(404);

    const item = await insertItem({ title: `Hidden Post ${uniq}`, body: 'secret' });
    await blog.blogAdapter.send(item);
    const slug = `hidden-post-${uniq}`;
    createdSlugs.push(slug);
    await pool.query('UPDATE blog_posts SET is_published = false WHERE slug = $1', [slug]);

    const res = await request(app).get(`/api/public/blog/${slug}`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 4. publishDue — the blog channel resolves to the real internal adapter
// ---------------------------------------------------------------------------
describe('publishDue publishes a blog item', () => {
  it('creates the post, marks the item published, and logs the blog adapter', async () => {
    const item = await insertItem({
      title: `Via Publisher ${uniq}`, body: 'published body',
      autonomy_tier: 0, status: 'scheduled',
      scheduled_at: new Date(Date.now() - 60000).toISOString(),
    });
    const slug = `via-publisher-${uniq}`;
    createdSlugs.push(slug);

    await publisher.publishDue(new Date());

    // Race-safe: assert on the ITEM's final state (only the blog adapter can
    // publish a `blog` item, so whichever worker claims it produces this ref).
    const row = await pool.query('SELECT status, external_ref FROM content_items WHERE id = $1', [item.id]);
    expect(row.rows[0].status).toBe('published');
    expect(row.rows[0].external_ref).toBe(`/blog/${slug}`);

    const post = await pool.query('SELECT * FROM blog_posts WHERE content_id = $1', [item.id]);
    expect(post.rowCount).toBe(1);

    const log = await pool.query('SELECT adapter, result FROM content_publish_log WHERE content_id = $1', [item.id]);
    expect(log.rows[0].adapter).toBe('blog');
    expect(log.rows[0].result).toBe('sent');
  });
});
