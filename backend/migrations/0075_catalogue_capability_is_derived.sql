-- Make `languages.has_catalogue` (and the `has_search` it implies) a DERIVED
-- fact that re-derives itself, instead of a snapshot taken once.
--
-- WHAT WENT WRONG. Migration 0039 computed has_catalogue from real data:
--   UPDATE languages SET has_catalogue = true
--    WHERE code IN (SELECT DISTINCT lang FROM catalog_i18n) OR code = 'en';
-- That was correct on the day it ran and its comment says so — bn/gu/mr had
-- zero catalogue rows then. Three days later the Bengali, Gujarati and Marathi
-- translations landed (977e397, 481 terms each) and nothing re-ran the
-- derivation, so the flag went on reporting an answer from before the data
-- existed. A shopkeeper browsing in Bengali was told her language had no
-- catalogue while 481 human-authored Bengali terms sat in the repo.
--
-- The defect is not the value, it is the SHAPE: a derived fact computed by a
-- one-shot statement is wrong from the next write onwards. Re-deriving it in
-- one more UPDATE here would fix today and break again the moment someone adds
-- a language's catalogue. So the derivation moves NEXT TO THE DATA: a trigger
-- on catalog_i18n keeps the flags in step with the rows no matter who writes
-- them — the importer, a migration, an admin tool, or a hand-typed INSERT.
--
-- Additive + idempotent: CREATE OR REPLACE for the functions, DROP TRIGGER IF
-- EXISTS before CREATE TRIGGER, and a closing re-derivation that is a no-op on
-- a database whose flags already agree with its rows.

-- The single definition of "does this language have a localized catalogue?".
-- en is the English base: it never has catalog_i18n rows and is always capable.
-- has_search rides along exactly as 0039 defined it — localized search recall
-- comes from the catalogue aliases, so a language has meaningful search exactly
-- where it has a catalogue.
--
-- Only writes when the stored flags actually disagree with the data, so the
-- common case (a row inserted for a language already marked capable) touches no
-- row and takes no lock — an import of several thousand rows is not several
-- thousand updates of the same `languages` row.
CREATE OR REPLACE FUNCTION refresh_language_catalogue_caps(p_lang text)
RETURNS void LANGUAGE sql AS $$
  UPDATE languages l
     SET has_catalogue = w.want,
         has_search    = w.want,
         updated_at    = NOW()
    FROM (
      SELECT (p_lang = 'en'
              OR EXISTS (SELECT 1 FROM catalog_i18n c WHERE c.lang = p_lang)) AS want
    ) w
   WHERE l.code = p_lang
     AND (l.has_catalogue IS DISTINCT FROM w.want OR l.has_search IS DISTINCT FROM w.want);
$$;

-- Re-derive for every language a statement touched. An INSERT or an UPDATE that
-- moves a row between languages can only ever ADD coverage to NEW.lang, but a
-- DELETE (or the losing side of that UPDATE) can remove the last row a language
-- had, so both sides are re-derived and the flag is allowed to fall as well as
-- rise. A flag that can only rise is the same kind of lie 0039 told, one
-- direction later.
CREATE OR REPLACE FUNCTION catalog_i18n_language_caps()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM refresh_language_catalogue_caps(OLD.lang);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM refresh_language_catalogue_caps(NEW.lang);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS catalog_i18n_language_caps_trg ON catalog_i18n;
CREATE TRIGGER catalog_i18n_language_caps_trg
AFTER INSERT OR UPDATE OR DELETE ON catalog_i18n
FOR EACH ROW EXECUTE FUNCTION catalog_i18n_language_caps();

-- One closing re-derivation for the rows already in the table, so an existing
-- database is correct the moment this migration lands rather than on its next
-- catalogue write. On a fresh database catalog_i18n is still empty here; the
-- import that runs at the end of `npm run migrate` fires the trigger above and
-- the flags follow it.
SELECT refresh_language_catalogue_caps(code) FROM languages;
