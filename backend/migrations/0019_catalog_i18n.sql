-- ⑥ Owner catalogue in local language (M6 i18n) — localized display + search of
-- the shared master catalog for owners whose English fluency is low.
--
-- ADDITIVE ONLY: a side table of translations for the small catalog vocabulary
-- (~285 terms: products, subcategories, categories). The base `catalog_items`
-- table is untouched and stays English (it is the stable key the DB stores and
-- the UI sends back as filter values). The API LEFT JOINs this table only when
-- ?lang != en, so English behaviour is unchanged.
--
-- A row is keyed by (term_type, term_en, lang): the English source term plus the
-- target language. `name` is the native-script translation; `aliases` holds
-- space-separated extra search tokens (romanized/alt spellings owners might type)
-- so search matches whether they type the local word, English, or a romanization.
CREATE TABLE IF NOT EXISTS catalog_i18n (
  term_type    text NOT NULL CHECK (term_type IN ('product','category','subcategory')),
  term_en      text NOT NULL,
  lang         text NOT NULL,
  name         text NOT NULL,
  aliases      text NOT NULL DEFAULT '',   -- space-separated extra search tokens (romanized/alt spellings)
  needs_review boolean NOT NULL DEFAULT false,
  PRIMARY KEY (term_type, term_en, lang)
);

-- Lookups are always "give me all translations for this lang + term_type" (the
-- list/categories joins) filtered further by term_en.
CREATE INDEX IF NOT EXISTS catalog_i18n_lang_type_idx ON catalog_i18n (lang, term_type);
