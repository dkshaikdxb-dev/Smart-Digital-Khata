-- Mark the eight regional languages as AUDITED (Batch AUD-2). Tamil (ta),
-- Telugu (te), Kannada (kn), Malayalam (ml), Urdu (ur), Bengali (bn),
-- Gujarati (gu) and Marathi (mr) were seeded/activated as audit_status
-- 'in_review' — LIVE but flagged as machine translations awaiting a native-
-- speaker audit (see 0022_languages and 0033_activate_bn_gu_mr).
--
-- Their committed UI translations (backend/src/data/regional-i18n.json) have
-- now had an AI native-language QA/audit pass — proofread key-by-key against
-- the English source for meaning, vernacular tone (rural kirana shopkeepers and
-- their customers), domain-term consistency, grammar/spelling and script, with
-- every placeholder token and brand/tech token preserved. So we flip all eight
-- from 'in_review' to 'audited'. Hindi (hi) and English (en) were already
-- 'audited' from 0022 and are intentionally untouched here.
--
-- Idempotent: a plain UPDATE keyed on code; safe to re-run. It only ever
-- touches these eight rows and never regresses any other language.
UPDATE languages
   SET audit_status = 'audited',
       updated_at   = NOW()
 WHERE code IN ('ta', 'te', 'kn', 'ml', 'ur', 'bn', 'gu', 'mr');
