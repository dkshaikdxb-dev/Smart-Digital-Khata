-- Language activation registry (Phase B). The set of languages SHOWN in the
-- app is now a DB registry the platform admin controls, so a new state's
-- language can be pre-staged and switched on with one button after a native-
-- speaker audit — no code deploy. The frontend dict
-- (admin-dashboard/src/lib/i18n.js) still holds the string catalog and the
-- built-in fallback list; this table only decides which languages are ACTIVE.
CREATE TABLE IF NOT EXISTS languages (
  code         TEXT PRIMARY KEY,
  label        TEXT NOT NULL,            -- native label for the picker (e.g. हिन्दी)
  english_name TEXT NOT NULL,            -- Hindi
  rtl          BOOLEAN NOT NULL DEFAULT false,
  is_active    BOOLEAN NOT NULL DEFAULT false,
  audit_status TEXT NOT NULL DEFAULT 'pending'
               CHECK (audit_status IN ('pending','in_review','audited')),
  sort_order   INT NOT NULL DEFAULT 100,
  activated_at TIMESTAMPTZ,
  activated_by UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the 7 CURRENTLY-LIVE languages as is_active=true so nothing regresses.
-- Idempotent: ON CONFLICT DO NOTHING leaves any later admin edits untouched on
-- re-run. Labels are the native names shown in the picker.
INSERT INTO languages (code, label, english_name, rtl, is_active, audit_status, sort_order) VALUES
  ('en', 'English',   'English',   false, true, 'audited',   1),
  ('hi', 'हिन्दी',      'Hindi',     false, true, 'audited',   2),
  ('ta', 'தமிழ்',       'Tamil',     false, true, 'in_review', 3),
  ('te', 'తెలుగు',      'Telugu',    false, true, 'in_review', 4),
  ('kn', 'ಕನ್ನಡ',       'Kannada',   false, true, 'in_review', 5),
  ('ml', 'മലയാളം',      'Malayalam', false, true, 'in_review', 6),
  ('ur', 'اردو',       'Urdu',      true,  true, 'in_review', 7)
ON CONFLICT (code) DO NOTHING;

-- Pre-stage CAPACITY — common next-state languages seeded is_active=false,
-- audit_status='pending' so the admin sees launch-ready rows to flip on after a
-- native-speaker audit. These have no UI strings yet; t() falls back to English
-- until their strings are supplied (see i18n.js).
INSERT INTO languages (code, label, english_name, rtl, is_active, audit_status, sort_order) VALUES
  ('mr', 'मराठी',    'Marathi',  false, false, 'pending', 20),
  ('bn', 'বাংলা',     'Bengali',  false, false, 'pending', 21),
  ('gu', 'ગુજરાતી',   'Gujarati', false, false, 'pending', 22),
  ('pa', 'ਪੰਜਾਬੀ',    'Punjabi',  false, false, 'pending', 23),
  ('or', 'ଓଡ଼ିଆ',     'Odia',     false, false, 'pending', 24),
  ('as', 'অসমীয়া',   'Assamese', false, false, 'pending', 25)
ON CONFLICT (code) DO NOTHING;
