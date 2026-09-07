-- Content engine — real blog + newsletter publishers (Batch T). ADDITIVE &
-- backward compatible. Turns the content engine's `blog`, `newsletter_community`
-- and `newsletter_ecosystem` outbox slots into REAL publishers.
--
--   BLOG      — INTERNAL, no external credentials. Publishing a `blog` item
--               inserts a public blog_posts row rendered on the marketing site
--               at /blog + /blog/<slug>. Ships fully working.
--   NEWSLETTER — a double-opt-in subscriber list + an SMTP send adapter. Ships
--               CONFIG-GATED and INERT: with no SMTP configured the publisher
--               keeps using the OUTBOX adapter, so nothing existing breaks.
--
-- Idempotent (IF NOT EXISTS throughout). Nothing existing is touched.

-- Public blog posts. One row per published `blog` content item (content_id, kept
-- as a soft link — ON DELETE SET NULL so purging a content item never deletes the
-- public post). `slug` is the public URL key and is globally UNIQUE.
CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID REFERENCES content_items(id) ON DELETE SET NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  is_published BOOLEAN NOT NULL DEFAULT true,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_blog_published ON blog_posts(is_published, published_at DESC);

-- Newsletter subscribers with a double-opt-in lifecycle: a `pending` row is
-- created on subscribe (+ a confirm_token e-mailed to the address), becomes
-- `active` only after the recipient opens the confirm link, and `unsubscribed`
-- via the unsub_token. UNIQUE (email, list) so re-subscribing is idempotent.
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  list TEXT NOT NULL CHECK (list IN ('community','ecosystem')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','unsubscribed')),
  confirm_token TEXT, unsub_token TEXT NOT NULL,
  confirmed_at TIMESTAMPTZ, unsubscribed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (email, list)
);
CREATE INDEX IF NOT EXISTS idx_news_active ON newsletter_subscribers(list, status);
