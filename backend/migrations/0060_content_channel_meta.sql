-- 0060_content_channel_meta.sql (batch FBIG1)
-- Add the Meta publisher channels — 'facebook' (Page) and 'instagram'
-- (Business) — to the content engine so the content desk can list them as
-- connectable publishers (see services/content-meta.service). The publishers
-- ship INERT/gated on a Meta app (no live Graph call, no fake tokens); this
-- migration ONLY widens the channel CHECK constraint on content_items so a
-- FB/IG content item can be created and moved through the pipeline.
--
-- NO new column is needed: connected-account storage reuses the existing
-- content_channel_accounts table (channel = 'facebook' | 'instagram') that the
-- LinkedIn/X publishers already use, and content_publish_log.channel is a bare
-- TEXT column (no constraint). This is the minimal, idempotent constraint bump.

ALTER TABLE content_items DROP CONSTRAINT IF EXISTS content_items_channel_check;
ALTER TABLE content_items ADD CONSTRAINT content_items_channel_check
  CHECK (channel IN
    ('blog','linkedin','twitter','facebook','instagram',
     'newsletter_community','newsletter_ecosystem','whatsapp_tip','reel','voice'));
