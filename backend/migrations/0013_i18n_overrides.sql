-- Live translation overrides. A native speaker can correct any UI string per
-- language from the admin dashboard and it goes live without a code deploy.
-- The frontend dict (admin-dashboard/src/lib/i18n.js) holds the key catalog and
-- the built-in text; this table only stores the OVERRIDES layered on top.
CREATE TABLE IF NOT EXISTS i18n_overrides (
  lang       TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (lang, key)
);
