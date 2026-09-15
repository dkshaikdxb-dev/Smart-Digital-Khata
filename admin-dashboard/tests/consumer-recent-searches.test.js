/**
 * "Recent searches": the shopper's own last few words.
 *
 * LOCAL ONLY, and that is a product decision, not an implementation detail.
 * There is no endpoint behind this list and there should never be one: a rural
 * shopper's recent searches are a record of what their household ran out of
 * this week. It is not ours to collect and not worth a byte of their data to
 * upload. So everything here is one localStorage key, and nothing in this file
 * touches the network.
 *
 * Nothing here may throw either. A blocked or corrupt store reads as "no recent
 * searches", which renders as nothing at all — exactly the brand-new shopper's
 * screen, which is a state this design is good at.
 */
import {
  RECENT_MAX, TERM_MAX, RECENT_KEY,
  cleanTerm, addRecentTerm, parseRecent, serializeRecent,
  loadRecentSearches, rememberSearch, clearRecentSearches,
} from '../src/lib/recentSearches';

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe('the list algebra', () => {
  it('puts the newest term first with no duplicate, keeping the latest spelling', () => {
    let list = addRecentTerm([], 'Toor Dal');
    list = addRecentTerm(list, 'haldi');
    list = addRecentTerm(list, 'toor dal');
    expect(list).toEqual(['toor dal', 'haldi']);
  });

  it('caps the list at six, which is what fits on a 360px screen', () => {
    let list = [];
    for (const t of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) list = addRecentTerm(list, t);
    expect(RECENT_MAX).toBe(6);
    expect(list).toEqual(['g', 'f', 'e', 'd', 'c', 'b']);
  });

  it('collapses whitespace and refuses what is not a grocery word', () => {
    expect(cleanTerm('  toor   dal ')).toBe('toor dal');
    expect(cleanTerm('')).toBe('');
    expect(cleanTerm('   ')).toBe('');
    expect(cleanTerm(null)).toBe('');
    expect(cleanTerm('x'.repeat(TERM_MAX + 40))).toHaveLength(TERM_MAX);
    expect(addRecentTerm(['haldi'], '   ')).toEqual(['haldi']);
  });

  it('reads a corrupt or hostile stored value as an empty list', () => {
    expect(parseRecent('not json')).toEqual([]);
    expect(parseRecent('{"a":1}')).toEqual([]);
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent(JSON.stringify([1, null, 'haldi', 'haldi', '  ']))).toEqual(['haldi']);
    expect(parseRecent(JSON.stringify(Array.from({ length: 50 }, (_, i) => `t${i}`)))).toHaveLength(RECENT_MAX);
  });

  it('serializes at most six terms', () => {
    expect(JSON.parse(serializeRecent(['a', 'b', 'c', 'd', 'e', 'f', 'g']))).toHaveLength(RECENT_MAX);
    expect(JSON.parse(serializeRecent(null))).toEqual([]);
  });
});

describe('the one key on the device', () => {
  it('round-trips through localStorage and nowhere else', () => {
    expect(loadRecentSearches()).toEqual([]);
    expect(rememberSearch('surf excel')).toEqual(['surf excel']);
    expect(JSON.parse(window.localStorage.getItem(RECENT_KEY))).toEqual(['surf excel']);
    expect(loadRecentSearches()).toEqual(['surf excel']);
    expect(clearRecentSearches()).toEqual([]);
    expect(window.localStorage.getItem(RECENT_KEY)).toBeNull();
  });

  it('keeps the shopper\'s own words out of the customer token namespace', () => {
    rememberSearch('haldi');
    expect(RECENT_KEY).toBe('ckhata_recent_searches');
    expect(window.localStorage.getItem('ckhata_token')).toBeNull();
  });

  it('survives a private window where storage throws', () => {
    const store = window.localStorage;
    const boom = () => { throw new Error('SecurityError'); };
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: { getItem: boom, setItem: boom, removeItem: boom },
    });
    try {
      expect(loadRecentSearches()).toEqual([]);
      // Still right in memory for this session, and no throw reaches the screen.
      expect(rememberSearch('haldi')).toEqual(['haldi']);
      expect(clearRecentSearches()).toEqual([]);
    } finally {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: store });
    }
  });

  it('ignores a term that is not worth storing', () => {
    expect(rememberSearch('   ')).toEqual([]);
    expect(window.localStorage.getItem(RECENT_KEY)).toBeNull();
  });
});
