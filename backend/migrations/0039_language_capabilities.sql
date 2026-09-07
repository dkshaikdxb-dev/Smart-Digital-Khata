-- Per-dimension language capability registry (v2 item 8). The `languages` table
-- (0022; +0033 activated bn/gu/mr; +0034 audited) already decides which
-- languages are SHOWN. But "shown" is not "fully supported": a language can be
-- live in the UI yet have no localized catalogue and no real voice model, in
-- which case the picker/mic silently implied support that does not exist.
--
-- This migration makes each capability EXPLICIT as its own boolean column so the
-- UI (and later batches) can gate honestly per dimension instead of assuming a
-- shown language supports everything. Additive + idempotent: columns default
-- false and are ADD COLUMN IF NOT EXISTS; the seeds are true-only UPDATEs keyed
-- on code, so re-running never regresses a flag and later admin edits survive.

-- 1) Capability columns. All boolean, default false so a brand-new / staged
--    language starts with no implied support until seeded.
ALTER TABLE languages ADD COLUMN IF NOT EXISTS has_ui       boolean NOT NULL DEFAULT false;
ALTER TABLE languages ADD COLUMN IF NOT EXISTS has_catalogue boolean NOT NULL DEFAULT false;
ALTER TABLE languages ADD COLUMN IF NOT EXISTS has_search   boolean NOT NULL DEFAULT false;
ALTER TABLE languages ADD COLUMN IF NOT EXISTS has_asr      boolean NOT NULL DEFAULT false;
ALTER TABLE languages ADD COLUMN IF NOT EXISTS has_tts      boolean NOT NULL DEFAULT false;
ALTER TABLE languages ADD COLUMN IF NOT EXISTS has_translit boolean NOT NULL DEFAULT false;
ALTER TABLE languages ADD COLUMN IF NOT EXISTS has_nmt      boolean NOT NULL DEFAULT false;

-- 2) Seed truthfully from REAL coverage (true-only sets; never flip a flag off).

-- has_ui: the languages currently active have translated UI string sets (or
-- degrade gracefully to English), so they are usable in the UI.
UPDATE languages SET has_ui = true
 WHERE code IN ('en','hi','ta','te','kn','ml','ur','bn','gu','mr');

-- has_catalogue: true ONLY where the localized catalogue actually has rows.
-- Driven off real data (catalog_i18n) so it can never claim coverage that isn't
-- there; en is the English base and always counts. bn/gu/mr have ZERO
-- catalog_i18n rows today, so they correctly stay false.
UPDATE languages SET has_catalogue = true
 WHERE code IN (SELECT DISTINCT lang FROM catalog_i18n) OR code = 'en';

-- has_search: search recall benefits from the catalogue aliases, so a language
-- has meaningful localized search exactly where it has a catalogue; en always.
UPDATE languages SET has_search = true
 WHERE has_catalogue = true OR code = 'en';

-- has_asr / has_tts: true ONLY for the BCP-47 set that the frontend actually
-- maps to a speech tag. This list is hardcoded to mirror the frontend map and
-- MUST be kept in sync with the BCP47 table in
-- admin-dashboard/src/lib/useSpeech.js (the source of truth for which languages
-- have a real ASR/TTS tag). Languages NOT in that map fall back to en-IN there,
-- i.e. they have no genuine voice — bn/gu/mr are absent, so they stay false.
UPDATE languages SET has_asr = true, has_tts = true
 WHERE code IN ('en','hi','ta','te','kn','ml','ur');

-- has_translit / has_nmt: no transliteration or neural-MT layer ships yet.
-- Left at the default false; a later batch flips these true when those layers
-- land. No UPDATE here keeps the intent explicit.
