// Integration tests for the regional translation override seed (Batch I).
// Requires a real Postgres (DATABASE_URL) with ALL migrations applied (incl.
// 0013 i18n_overrides). Mirrors the style of catalog-i18n.test.js + i18n.test.js.
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_abc';

const app = require('../src/app');
const { pool } = require('../src/config/db');
const { importI18nOverrides } = require('../src/utils/import-i18n-overrides');
const seed = require('../src/data/regional-i18n.json');

const SEED_LANGS = Object.keys(seed); // ta te kn ml ur

// Total non-empty rows the seed should upsert.
const seedRowCount = SEED_LANGS.reduce((n, lang) => n + Object.keys(seed[lang]).length, 0);

// Interpolation tokens that MUST survive translation, keyed by the string key.
// (The en source is the frontend dict; this is the expected {token} set for the
// keys the seed covers - a guard against dropping a placeholder.)
const EXPECTED_TOKENS = {
  'c.addForFree': ['amt'], 'c.deliveryHoursLabel': ['hours'], 'c.enterCodeSentTo': ['phone'],
  'c.freeAboveAmt': ['amt'], 'c.limitSuffix': ['amt'], 'c.minOrder': ['amt'],
  'cat.deleteConfirm': ['name'], 'common.itemCount': ['n', 's'], 'cust.archiveConfirm': ['name'],
  'customers.remindersSent': ['n', 's'], 'fam.membersN': ['n', 's'], 'fam.payerSuffix': ['name'],
  'fam.removeConfirm': ['name'], 'ins.downloaded': ['file'], 'ins.lastDays': ['d'],
  'ins.newCustomers': ['d'], 'num.enterCode': ['phone'], 'off.pending': ['n'],
  'ord.mark': ['s'], 'ord.marked': ['s'], 'own.nudge.busy_day': ['day'],
  'own.nudge.collected_today': ['amount'], 'own.nudge.collected_today_down': ['amount', 'delta'],
  'own.nudge.collected_today_up': ['amount', 'delta'], 'own.nudge.dues_pending': ['amount', 'days', 'n'],
  'own.nudge.near_limit': ['n', 'pct'], 'own.nudge.outstanding_total': ['amount'],
  'own.nudge.top_item': ['item'], 'set.planUpdated': ['code'], 'set.upTo': ['n'],
  'tx.paymentLinkSent': ['link'], 'voice.balanceSay': ['amount', 'name', 'rupees'],
};

const tokensOf = (s) => (String(s).match(/\{(\w+)\}/g) || []).map((m) => m.slice(1, -1)).sort();

const hasControlChar = (s) => {
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c === 0 || (c < 32 && c !== 9 && c !== 10) || c === 127) return true;
  }
  return false;
};

// Clean any pre-existing seed rows so the counts below are deterministic.
async function clearSeedRows() {
  for (const lang of SEED_LANGS) {
    const keys = Object.keys(seed[lang]);
    if (keys.length) {
      await pool.query('DELETE FROM i18n_overrides WHERE lang = $1 AND key = ANY($2::text[])', [lang, keys]);
    }
  }
}

async function countSeedRows() {
  let n = 0;
  for (const lang of SEED_LANGS) {
    const keys = Object.keys(seed[lang]);
    const r = await pool.query(
      'SELECT COUNT(*)::int AS n FROM i18n_overrides WHERE lang = $1 AND key = ANY($2::text[])',
      [lang, keys]
    );
    n += r.rows[0].n;
  }
  return n;
}

beforeAll(async () => {
  await clearSeedRows();
});

afterAll(async () => {
  await clearSeedRows();
  await pool.end();
});

describe('import-i18n-overrides', () => {
  it('imports every seed row and is idempotent (stable counts, no dupes)', async () => {
    const first = await importI18nOverrides();
    expect(first.upserted).toBe(seedRowCount);
    for (const lang of SEED_LANGS) {
      expect(first.perLang[lang]).toBe(Object.keys(seed[lang]).length);
    }
    expect(await countSeedRows()).toBe(seedRowCount);

    // Re-run - UPSERT in place, no duplicates (PK is (lang,key)).
    const second = await importI18nOverrides();
    expect(second.upserted).toBe(seedRowCount);
    expect(await countSeedRows()).toBe(seedRowCount);
  });

  it('stores the expected native value for a spot-checked (lang, key)', async () => {
    const r = await pool.query(
      "SELECT value FROM i18n_overrides WHERE lang = 'ta' AND key = 'nav.customers'"
    );
    expect(r.rows[0].value).toBe(seed.ta['nav.customers']);
  });
});

describe('public GET /api/i18n/overrides reflects the imported seed', () => {
  it('returns overrides shaped { lang: { key: value } }', async () => {
    await importI18nOverrides();
    const res = await request(app).get('/api/i18n/overrides');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('overrides');
    for (const lang of SEED_LANGS) {
      expect(res.body.overrides[lang]).toBeTruthy();
      expect(res.body.overrides[lang]['common.save']).toBe(seed[lang]['common.save']);
    }
  });
});

describe('seed integrity', () => {
  it('every value is a non-empty string', () => {
    for (const lang of SEED_LANGS) {
      for (const value of Object.values(seed[lang])) {
        expect(typeof value).toBe('string');
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('has no NUL or control bytes', () => {
    for (const lang of SEED_LANGS) {
      for (const value of Object.values(seed[lang])) {
        expect(hasControlChar(value)).toBe(false);
      }
    }
  });

  it('preserves every interpolation token from the source string', () => {
    for (const [key, expected] of Object.entries(EXPECTED_TOKENS)) {
      for (const lang of SEED_LANGS) {
        const value = seed[lang][key];
        if (value === undefined) continue; // key omitted for this lang => English fallback
        expect(tokensOf(value)).toEqual([...expected].sort());
      }
    }
  });
});

// Batch M — the owner voice ("Ask") answers + the weekly summary must be spoken/
// shown in the owner's language. These 13 keys were added AFTER the original
// regional override pass and previously fell back to English; the seed must now
// carry a native value for EVERY one of ta/te/kn/ml/ur.
describe('voice + weekly keys are covered natively for all regional languages', () => {
  // Per-language Unicode block, used to prove a value is in the native script
  // (an English fallback would be Latin/ASCII, even though it may carry a ₹).
  const SCRIPT = {
    ta: /[஀-௿]/, // Tamil
    te: /[ఀ-౿]/, // Telugu
    kn: /[ಀ-೿]/, // Kannada
    ml: /[ഀ-ൿ]/, // Malayalam
    ur: /[؀-ۿ]/, // Arabic (Urdu)
  };

  // The 13 previously-missing keys and the tokens each MUST preserve.
  const VOICE_WEEKLY_TOKENS = {
    'ask.button': [], 'ask.prompt': [], 'ask.listening': [], 'ask.tryAgain': [], 'ask.fallback': [],
    'ask.answer.collection': ['amount'], 'ask.answer.outstanding': ['amount', 'n'],
    'ask.answer.whoOwes': ['n'], 'ask.answer.bestSeller': ['item'], 'ask.answer.bestSellerNone': [],
    'own.weekly.title': [], 'own.weekly.subtitle': [], 'own.weekly.loadError': [],
  };

  it('every one of the 13 keys has a non-empty native value for ta/te/kn/ml/ur', () => {
    expect(Object.keys(VOICE_WEEKLY_TOKENS)).toHaveLength(13);
    for (const key of Object.keys(VOICE_WEEKLY_TOKENS)) {
      for (const lang of SEED_LANGS) {
        const value = seed[lang][key];
        expect(typeof value).toBe('string');
        expect(value.trim().length).toBeGreaterThan(0);
        // native script present → NOT an English fallback
        expect(SCRIPT[lang].test(value)).toBe(true);
        // no NUL/control bytes
        expect(hasControlChar(value)).toBe(false);
      }
    }
  });

  it('preserves the {token} set on the spoken answer templates', () => {
    for (const [key, expected] of Object.entries(VOICE_WEEKLY_TOKENS)) {
      for (const lang of SEED_LANGS) {
        expect(tokensOf(seed[lang][key])).toEqual([...expected].sort());
      }
    }
  });

  it('GET /api/i18n/overrides returns all 13 keys natively for every regional language', async () => {
    await importI18nOverrides();
    const res = await request(app).get('/api/i18n/overrides');
    expect(res.status).toBe(200);
    for (const key of Object.keys(VOICE_WEEKLY_TOKENS)) {
      for (const lang of SEED_LANGS) {
        const value = res.body.overrides[lang][key];
        expect(typeof value).toBe('string');
        expect(value.trim().length).toBeGreaterThan(0);
        expect(SCRIPT[lang].test(value)).toBe(true);
        expect(value).toBe(seed[lang][key]);
      }
    }
  });
});
