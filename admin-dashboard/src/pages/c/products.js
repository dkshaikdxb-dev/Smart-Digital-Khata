import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import CustomerShell, { money } from '../../components/CustomerShell';
import ProductThumb from '../../components/ProductThumb';
import {
  useLang, canUseVoice, useLanguageCapability, getActiveLanguages, LANGS,
} from '../../lib/i18n';
import { availabilityLine, isOpen } from '../../lib/shopOpen';
import { useVoiceSearch } from '../../lib/useVoiceSearch';
import VoiceSearchHint from '../../components/VoiceSearchHint';
import { uiError } from '../../lib/errorText';
import { CATEGORIES, categoryByKey } from '../../lib/categories';
import { searchProducts, buyAgain, BUY_AGAIN_MAX } from '../../lib/consumerSearch';
import {
  loadRecentSearches, rememberSearch, clearRecentSearches,
} from '../../lib/recentSearches';

// Cross-shop product search. Backed by GET /api/public/products/search — active
// products in listed shops matching a word, or sitting on a catalogue SHELF.
// The same endpoint the native app's search screen uses, so both surfaces rank
// and localize identically.
//
// ---------------------------------------------------------------------------
// WHAT THE SHOPPER SEES BEFORE THEY SEARCH, AND IN WHAT ORDER
//
// 1. The search unit: the text box, and DIRECTLY BENEATH IT a full-width voice
//    control — not the small mic beside the box that the directory has. Typing
//    is the hardest thing this audience can be asked to do; speaking costs them
//    nothing, needs no letters, and works the first time they open the site. So
//    it sits highest and it is impossible to miss, and it names the language it
//    will listen in, because someone whose site is in Marathi should be able to
//    see it will listen in Marathi before they spend a breath on it.
// 2. Recent searches — their own last few words, from this device only. No
//    backend, nothing synced, and a Clear that really clears.
// 3. Shop by category — always there, the universal fallback, and the section a
//    brand-new shopper will actually use. Each chip is a REAL shelf now.
// 4. Buy it again — their own past items, most frequent first, one tap each. A
//    kirana basket barely changes month to month, so for a returning shopper
//    this is often the whole journey. It is LAST because it is the tallest
//    section by far: above the shelves it would push them off a 360px screen,
//    and the shopper who wants it is the one who scrolls for it.
//
// THE GOVERNING RULE: a section with no data renders NOTHING AT ALL — no
// placeholder, no skeleton, and no "you have no past orders", which tells
// someone off for being new. A brand-new shopper gets a box, a big microphone
// and six real shelves, which is a complete screen; that is the state this
// design has to be good at.
//
// Built for 2G: typing is debounced, a superseded request is ABORTED rather
// than merely ignored, a stale response can never overwrite a newer one, and
// nothing personal blocks the first paint. No price is fetched for a
// buy-it-again row — a price is a per-shop lookup, and a stale one beside a
// remembered item is worse than none.
const DEBOUNCE_MS = 350;

// The language's own name, for the line saying which language the microphone
// will listen in. It is DATA, not a translated string, so it reads correctly in
// every language including the three with no translator yet.
//
// The built-in list is asked FIRST because its `name` is the language's full
// native name ("English", "हिन्दी") while its `label` is the two-character glyph
// the switcher shows — "Listens in हिं" is not a sentence. A language that is
// active in the registry but not built in (bn/gu/mr) has only the registry's
// label, which is its full name.
function languageLabel(code) {
  const builtIn = LANGS.find((l) => l.code === code);
  if (builtIn) return builtIn.name;
  const active = getActiveLanguages().find((l) => l.code === code);
  return active && active.label ? active.label : String(code || '');
}

export default function ProductSearch() {
  const router = useRouter();
  const { t, lang } = useLang();

  const [q, setQ] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false); // a query has run at least once
  // The shelf being browsed ('' when searching by word), so the results can be
  // headed with its name — the box stays empty on a shelf on purpose.
  const [shelf, setShelf] = useState('');

  const [recent, setRecent] = useState([]);
  const [again, setAgain] = useState([]);

  // Track the latest in-flight request so a slow earlier response can never
  // overwrite a newer one, and abort whatever it superseded.
  const reqIdRef = useRef(0);
  const abortRef = useRef(null);
  const debounceRef = useRef(null);

  // `category` runs a real shelf filter; `term` is a word. Either may be empty,
  // and both empty means "back to the browse screen".
  const runSearch = useCallback(async (term, category) => {
    const text = (term || '').trim();
    const shelfKey = String(category || '');

    // Whatever was in flight is now superseded — stop paying for it.
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch (e) { /* already settled */ }
      abortRef.current = null;
    }

    if (!text && !shelfKey) {
      reqIdRef.current += 1; // invalidate anything still landing
      setProducts([]);
      setSearched(false);
      setShelf('');
      setError('');
      setLoading(false);
      return;
    }

    const reqId = ++reqIdRef.current;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    abortRef.current = controller;

    setLoading(true);
    setError('');
    setSearched(true);
    setShelf(shelfKey);
    try {
      const chip = shelfKey ? categoryByKey(shelfKey) : null;
      const r = await searchProducts({
        q: text || undefined,
        category: shelfKey || undefined,
        // The keyword this chip used before shelves existed. consumerSearch only
        // reaches for it when an older server refuses the shelf outright.
        fallbackTerm: chip ? chip.term : undefined,
        lang,
        limit: 30,
        signal: controller ? controller.signal : undefined,
      });
      if (reqId !== reqIdRef.current) return; // a newer search superseded this one
      setProducts(r.products || []);
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      if (err && (err.name === 'AbortError' || err.code === 20)) return; // we aborted it
      setError(uiError(t, err));
      setProducts([]);
    } finally {
      if (reqId === reqIdRef.current) {
        setLoading(false);
        abortRef.current = null;
      }
    }
  }, [lang]);

  // Voice search with real feedback (Listening… + denied/empty/offline/iOS
  // messages) and honest iOS handling — see useVoiceSearch. A real transcript
  // fills the box, is remembered, and runs the search.
  const voice = useVoiceSearch((tx) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQ(tx);
    setRecent(rememberSearch(tx));
    runSearch(tx, '');
  });
  // Hide the control for languages the browser can't reliably recognize, and on
  // browsers that can't recognize at all. When it cannot work, nothing is
  // rendered and nothing is said about it: a shopper who cannot use voice is not
  // helped by being told so every time they open the screen. The capability hook
  // is read UNCONDITIONALLY (not behind the && ) so the hook order is the same
  // on every render of this component.
  const voiceCaps = useLanguageCapability(lang);
  const voiceOk = voice.sttSupported && canUseVoice(lang, voiceCaps);

  // Seed from the URL (?q=… or ?category=…) once the router is ready, so the
  // home bar and the directory's shelf chips can deep-link straight into
  // results. An unknown shelf key is refused here rather than sent to the
  // server, which would only answer 400.
  useEffect(() => {
    if (!router.isReady) return;
    const initialQ = typeof router.query.q === 'string' ? router.query.q : '';
    const initialCat = typeof router.query.category === 'string' ? router.query.category : '';
    const shelfKey = categoryByKey(initialCat) ? initialCat : '';
    if (initialQ || shelfKey) {
      setQ(initialQ);
      runSearch(initialQ, shelfKey);
    }
    // Only on first ready; typed changes are handled by the debounce below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  // The two personal sections. Both are best-effort and both are silent about
  // failure: an empty list renders nothing, which is the brand-new-shopper
  // screen, so a server without the endpoint, a dead radio or a blocked store
  // all land on a screen that is still completely usable. Neither blocks paint.
  useEffect(() => {
    let alive = true;
    setRecent(loadRecentSearches());
    buyAgain(BUY_AGAIN_MAX).then((items) => {
      if (alive) setAgain(Array.isArray(items) ? items : []);
    });
    return () => { alive = false; };
  }, []);

  // Tear down on unmount: the pending timer AND the in-flight request, so
  // leaving mid-search costs the shopper nothing more.
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) { try { abortRef.current.abort(); } catch (e) { /* ignore */ } }
    reqIdRef.current += 1;
  }, []);

  // Debounce typed input (~350ms) before hitting the endpoint. Typing is NOT
  // remembered — only a word the shopper committed to is (submitted, spoken, or
  // tapped), never every keystroke on the way there.
  function onType(value) {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(value, ''), DEBOUNCE_MS);
  }

  function onSubmit(e) {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setRecent(rememberSearch(q));
    runSearch(q, '');
  }

  // A chip is a SHELF, not a word. The box is left empty on purpose: there is no
  // keyword to show, and putting one there would invite the shopper to edit a
  // term the results did not come from.
  function pickShelf(category) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQ('');
    runSearch('', category);
  }

  function pickTerm(term) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQ(term);
    setRecent(rememberSearch(term));
    runSearch(term, '');
  }

  const shelfChip = shelf ? categoryByKey(shelf) : null;
  // The browse surface is what stands in for "nothing searched yet". There is no
  // separate hint card any more: three real sections say more than a sentence.
  const browsing = !error && !loading && !searched;

  return (
    <CustomerShell title={t('c.productsTitle')} back="/c/shops">
      {/* ---- 1. THE SEARCH UNIT: the box, then the voice control ---- */}
      <form onSubmit={onSubmit} className="card cpwa-search">
        <div className="cpwa-search-voice">
          <input
            type="search"
            value={q}
            onChange={(e) => onType(e.target.value)}
            placeholder={t('c.searchProductsAll')}
            aria-label={t('c.searchProductsAll')}
          />
        </div>

        {/* The zero-literacy, zero-data path, and the only control here that
            works for a shopper who cannot read the box above it. Full width,
            accent-filled and tall: it has to read as the primary action on the
            screen. Rendered only when it will actually work. */}
        {voiceOk && (
          <button
            type="button"
            className={`cpwa-voice-big${voice.listening ? ' listening' : ''}`}
            onClick={voice.start}
            aria-label={t('voice.listen')}
          >
            <span className="cpwa-voice-ico" aria-hidden="true">🎤</span>
            <span className="cpwa-voice-text">
              <span className="cpwa-voice-title">
                {voice.listening ? t('voice.listening') : t('voice.listen')}
              </span>
              <span className="cpwa-voice-sub">
                {t('c.voiceIn', { language: languageLabel(lang) })}
              </span>
            </span>
          </button>
        )}
        {voiceOk && <VoiceSearchHint listening={voice.listening} hint={voice.hint} />}
      </form>

      {/* ---- the search states, each visibly its own thing ---- */}
      {error && <div className="card cpwa-error">{error}</div>}
      {!error && loading && <div className="card">{t('c.searching')}</div>}
      {!error && !loading && shelfChip && (
        <h2 className="cpwa-shelf-head">
          <span aria-hidden="true">{shelfChip.icon}</span> {t(shelfChip.key)}
        </h2>
      )}
      {!error && !loading && searched && products.length === 0 && (
        <div className="card muted">{t('c.noProductsFound')}</div>
      )}

      {/* ---- 2. RECENT SEARCHES: their own words, this device only ---- */}
      {browsing && recent.length > 0 && (
        <section className="cpwa-section">
          <div className="cpwa-section-head">
            <h2 className="cpwa-section-title">{t('c.recentSearches')}</h2>
            <button
              type="button"
              className="secondary cpwa-clear-recent"
              onClick={() => setRecent(clearRecentSearches())}
            >
              {t('c.clearRecent')}
            </button>
          </div>
          <div className="cpwa-chips cpwa-recent">
            {recent.map((term) => (
              <button key={term} type="button" className="cpwa-chip" onClick={() => pickTerm(term)}>
                {term}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ---- 3. SHOP BY CATEGORY: always present, and no longer a keyword ---- */}
      {browsing && (
        <section className="cpwa-section">
          <h2 className="cpwa-section-title">{t('c.shopByCategory')}</h2>
          <div className="cpwa-chips cpwa-cats" role="group" aria-label={t('c.shopByCategory')}>
            {CATEGORIES.map((c) => (
              <button
                key={c.category}
                type="button"
                className="cpwa-chip"
                onClick={() => pickShelf(c.category)}
              >
                <span className="cpwa-chip-ico" aria-hidden="true">{c.icon}</span>{' '}
                <span className="cpwa-chip-label">{t(c.key)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ---- 4. BUY IT AGAIN: their own items, most frequent first ---- */}
      {browsing && again.length > 0 && (
        <section className="cpwa-section">
          <h2 className="cpwa-section-title">{t('c.buyItAgain')}</h2>
          <div className="cpwa-again">
            {again.map((item, i) => (
              <button
                key={`${item.name}:${item.shop_id || i}`}
                type="button"
                className="cpwa-again-row"
                onClick={() => pickTerm(item.name)}
              >
                <span className="cpwa-again-ico" aria-hidden="true">↻</span>
                <span className="cpwa-again-text">
                  <span className="cpwa-again-name">{item.name}</span>
                  {item.shop_name && (
                    <span className="cpwa-again-shop muted">
                      {t('c.atShop', { shop: item.shop_name })}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {!loading && !error && products.map((p) => (
        <Link key={p.id} href={`/c/shop/${p.shop.id}`} className="card cpwa-shopcard">
          <ProductThumb product={p} />
          <div className="cpwa-shopcard-body">
            <div className="cpwa-shopcard-name">{p.name}</div>
            <div className="cpwa-product-price">
              {money(p.price)}{' '}
              <span className="muted">/ {p.unit || t('c.unit')}</span>
            </div>
            <div className="muted">
              {t('c.atShop', { shop: p.shop.name })}
              {[p.shop.area, p.shop.city].filter(Boolean).length > 0 &&
                ` · ${[p.shop.area, p.shop.city].filter(Boolean).join(', ')}`}
            </div>
            {/* Shop availability (batch A): the nested shop carries the SAME
                availability object the directory does, so a result from a shut
                shop says so here too instead of only on the storefront. */}
            {(p.shop.distance_km != null || !isOpen(p.shop.availability)) && (
              <div className="cpwa-shopcard-meta">
                {!isOpen(p.shop.availability) && (
                  <span className="badge cpwa-closed-pill">{t('open.closedPill')}</span>
                )}
                {p.shop.distance_km != null && (
                  <span className="badge">{p.shop.distance_km} {t('c.kmAway')}</span>
                )}
              </div>
            )}
            {!isOpen(p.shop.availability) && (
              <div className="muted cpwa-closed-hint">{availabilityLine(t, p.shop.availability, lang)}</div>
            )}
          </div>
          <span className="cpwa-chev">›</span>
        </Link>
      ))}
    </CustomerShell>
  );
}
