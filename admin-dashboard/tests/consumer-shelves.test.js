/**
 * The quick-browse category chips, and the promise they make.
 *
 * THEY USED TO LIE. Every chip on the web ran a plain keyword search: "Dairy"
 * searched the word `milk`, "Household" searched `soap`, "Personal Care"
 * searched `shampoo`. Measured against the shipped catalogue those chips reached
 * 14 of 44 Dairy SKUs, 20 of 294 Household, 12 of 170 Personal Care. A shopper
 * shown a seventh of an aisle does not conclude the chip is bad; they conclude
 * the shop has nothing, and they stop looking.
 *
 * The backend now owns a closed allowlist of SHELVES
 * (backend/src/utils/catalog-shelves.js) resolved against the catalogue's own
 * category/subcategory columns, and the native app already ships six chips
 * chosen on evidence. THE WEB MUST NOT DRIFT FROM THE APP HERE: a shopper who
 * moves between the two surfaces has to get the same six shelves. So these
 * tests do not restate the six keys as a literal list of their own — they read
 * the app's file and the backend's file off disk and require all three to
 * agree. A seventh shelf added anywhere fails here until it is added
 * everywhere.
 */
import fs from 'node:fs';
import path from 'node:path';

import { CATEGORIES, categoryByKey } from '../src/lib/categories';
import { translate, staticValue } from '../src/lib/i18n';

const REPO = path.join(__dirname, '..', '..');
const APP_CATEGORIES = path.join(REPO, 'mobile-app', 'src', 'consumer', 'lib', 'categories.js');
const BACKEND_SHELVES = path.join(REPO, 'backend', 'src', 'utils', 'catalog-shelves.js');
const CATALOG_I18N = path.join(REPO, 'backend', 'src', 'data', 'catalog-i18n.json');

// Parse the app's chip table out of its source. Deliberately a parse of the
// real file rather than an import: the app is React Native and its module graph
// does not load in this jsdom runner.
function appCategories() {
  const src = fs.readFileSync(APP_CATEGORIES, 'utf8');
  const body = src.slice(src.indexOf('export const CATEGORIES'), src.indexOf('];', src.indexOf('export const CATEGORIES')));
  return [...body.matchAll(/\{\s*key:\s*'([^']+)',\s*category:\s*'([^']+)',\s*term:\s*'([^']+)',\s*icon:\s*'([^']+)'\s*\}/g)]
    .map((m) => ({ key: m[1], category: m[2], term: m[3], icon: m[4] }));
}

// The backend's allowlist, in the order it declares it.
function backendShelfKeys() {
  const src = fs.readFileSync(BACKEND_SHELVES, 'utf8');
  const body = src.slice(src.indexOf('const SHELVES = ['), src.indexOf('];', src.indexOf('const SHELVES = [')));
  return [...body.matchAll(/\{\s*key:\s*'([^']+)'/g)].map((m) => m[1]);
}

// The human-written, already-shipped catalogue names for a subcategory.
function catalogueNames(termEn) {
  const rows = JSON.parse(fs.readFileSync(CATALOG_I18N, 'utf8'));
  const row = rows.find((r) => r.term_type === 'subcategory' && r.term_en === termEn);
  if (!row) throw new Error(`no subcategory row for ${termEn}`);
  return Object.fromEntries(Object.entries(row.translations).map(([lang, v]) => [lang, v.name]));
}

describe('the six shelves are the same six everywhere', () => {
  it('matches the native app, key for key and in the same order', () => {
    expect(CATEGORIES.map((c) => c.category)).toEqual(appCategories().map((c) => c.category));
  });

  it('matches the backend allowlist exactly — no shelf the server does not own', () => {
    const backend = backendShelfKeys();
    expect(CATEGORIES.map((c) => c.category)).toEqual(backend);
    expect(backend).toEqual([
      'atta-rice', 'dal-pulses', 'spices', 'cooking-oils', 'household', 'personal-care',
    ]);
  });

  it('carries the app\'s icon and old keyword for every shelf', () => {
    const app = appCategories();
    CATEGORIES.forEach((c, i) => {
      expect({ icon: c.icon, term: c.term }).toEqual({ icon: app[i].icon, term: app[i].term });
    });
  });

  it('uses the WEB dictionary convention for the label key', () => {
    // app 'cat.attaRice' -> web 'c.catAttaRice'; same string, this project's
    // own namespace.
    const app = appCategories();
    CATEGORIES.forEach((c, i) => {
      const suffix = app[i].key.replace(/^cat\./, '');
      expect(c.key).toBe(`c.cat${suffix[0].toUpperCase()}${suffix.slice(1)}`);
    });
  });

  it('drops the two chips that were measured as lying, and says nothing about them', () => {
    const keys = CATEGORIES.map((c) => c.category);
    expect(keys).not.toContain('dairy');
    expect(keys).not.toContain('snacks');
  });

  it('looks a shelf up by its server key, and refuses anything else', () => {
    expect(categoryByKey('household').term).toBe('soap');
    expect(categoryByKey('dairy')).toBeNull();
    expect(categoryByKey('')).toBeNull();
    expect(categoryByKey(null)).toBeNull();
    expect(categoryByKey('../admin')).toBeNull();
  });
});

describe('every chip has a label a shopper can read', () => {
  it('resolves in English', () => {
    for (const c of CATEGORIES) {
      expect(translate('en', c.key)).not.toBe(c.key);
      expect(translate('en', c.key).length).toBeGreaterThan(0);
    }
  });

  it('carries the catalogue\'s own human-written names for the three new shelves', () => {
    const pairs = [
      ['c.catDalPulses', 'Dal & Pulses'],
      ['c.catSpices', 'Spices'],
      ['c.catCookingOils', 'Cooking Oils'],
    ];
    for (const [key, termEn] of pairs) {
      const shipped = catalogueNames(termEn);
      expect(translate('en', key)).toBe(termEn);
      // Only the languages this dictionary actually has a block for; bn/gu/mr
      // have none, which is checked separately below.
      for (const lang of ['hi', 'ta', 'te', 'kn', 'ml', 'ur']) {
        expect(staticValue(lang, key)).toBe(shipped[lang]);
      }
    }
  });

  it('renders a real word, never a raw key, in every language the dictionary has', () => {
    for (const lang of ['en', 'hi', 'ta', 'te', 'kn', 'ml', 'ur']) {
      for (const c of CATEGORIES) {
        expect(staticValue(lang, c.key)).not.toBe('');
        expect(translate(lang, c.key)).not.toBe(c.key);
      }
    }
  });

  it('falls back to English for bn/gu/mr, which have no block here at all', () => {
    // Stated rather than hidden: those three languages have no DICT block in
    // this dictionary, so every chip label reads in English for them — the same
    // as the rest of this screen does today.
    for (const lang of ['bn', 'gu', 'mr']) {
      for (const c of CATEGORIES) {
        expect(staticValue(lang, c.key)).toBe('');
        expect(translate(lang, c.key)).toBe(translate('en', c.key));
      }
    }
  });
});
