-- Owner Help "lane B" — weekly WhatsApp summary (Batch J). A once-a-week
-- plain-language recap sent to the shop OWNER on WhatsApp, aimed at owners who
-- rarely open the app. Two additive, backward-compatible columns on shops:
--   weekly_summary              opt-in flag (defaults ON; owner can switch it
--                               off in Settings, mirroring daily_digest).
--   weekly_summary_last_sent_at when the last weekly summary was sent — the
--                               worker skips a shop whose last send is < 6 days
--                               old, so a re-run in the same week never double-
--                               sends. NULL means "never sent".
-- Idempotent (ADD COLUMN IF NOT EXISTS) so re-running the migration is safe.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS weekly_summary BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS weekly_summary_last_sent_at TIMESTAMPTZ;
