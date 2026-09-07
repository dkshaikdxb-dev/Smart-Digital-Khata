-- Activate Bengali (bn), Gujarati (gu) and Marathi (mr) in the language
-- registry (Batch Y). These three rows were pre-staged by 0022_languages as
-- is_active=false, audit_status='pending'. This batch supplies their full UI
-- translations (backend/src/data/regional-i18n.json) so they can now be shown
-- across the owner app, admin and consumer web PWA.
--
-- We flip them to is_active=true, audit_status='in_review' — exactly the state
-- ta/te/kn/ml/ur are in: LIVE but flagged as machine translations still awaiting
-- a native-speaker audit. They are deliberately NOT marked 'audited'.
--
-- Idempotent: a plain UPDATE keyed on code; safe to re-run. It only ever touches
-- these three rows and never regresses any other language. If an admin has since
-- audited one of them, re-running would pull audit_status back to 'in_review' —
-- acceptable here because at deploy time these are freshly machine-translated;
-- later audits happen after this migration has already run.
UPDATE languages
   SET is_active    = true,
       audit_status = 'in_review',
       updated_at   = NOW()
 WHERE code IN ('bn', 'gu', 'mr');
