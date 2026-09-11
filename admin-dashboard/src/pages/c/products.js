import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import CustomerShell, { money } from '../../components/CustomerShell';
import ProductThumb from '../../components/ProductThumb';
import { publicFetch } from '../../lib/customerApi';
import { useLang, canUseVoice, useLanguageCapability } from '../../lib/i18n';
import { useVoiceSearch } from '../../lib/useVoiceSearch';
import VoiceSearchHint from '../../components/VoiceSearchHint';

// Cross-shop product search (Flipkart-style). Backed by the public endpoint
// GET /api/public/products/search — active products in listed shops whose
// (localized or base) name matches the query. The home bar and category chips
// on /c/shops deep-link here via ?q=. Voice input reuses the shared Web-Speech
// hook; no geolocation prompt is added here (we only pass coords we already
// hold, which on a fresh visit is none).
export default function ProductSearch() {
  const router = useRouter();
  const { t, lang } = useLang();
  // Voice search with real feedback (Listening… + denied/empty/offline/iOS
  // messages) and honest iOS handling — see useVoiceSearch. A real transcript
  // fills the box and runs the search exactly as before (happy path unchanged).
  const voice = useVoiceSearch((tx) => { setQ(tx); runSearch(tx); });
  // Hide the mic for languages the browser can't reliably recognize (Batch B).
  const voiceOk = voice.sttSupported && canUseVoice(lang, useLanguageCapability(lang));

  const [q, setQ] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false); // a query has run at least once

  // Track the latest in-flight request so a slow earlier response can never
  // overwrite a newer one.
  const reqIdRef = useRef(0);

  const runSearch = useCallback(async (term) => {
    const text = (term || '').trim();
    if (!text) {
      setProducts([]);
      setSearched(false);
      setError('');
      setLoading(false);
      return;
    }
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError('');
    setSearched(true);
    try {
      const params = new URLSearchParams();
      params.set('q', text);
      if (lang) params.set('lang', lang);
      params.set('limit', '30');
      const r = await publicFetch(`/api/public/products/search?${params.toString()}`);
      if (reqId !== reqIdRef.current) return; // a newer search superseded this one
      setProducts(r.products || []);
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      setError(err.message);
      setProducts([]);
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [lang]);

  // Seed q from the URL (?q=…) once the router is ready and run the search, so
  // the home bar / category chips can deep-link straight into results.
  useEffect(() => {
    if (!router.isReady) return;
    const initial = typeof router.query.q === 'string' ? router.query.q : '';
    if (initial) {
      setQ(initial);
      runSearch(initial);
    }
    // Only on first ready; typed changes are handled by the debounce below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  // Debounce typed input (~350ms) before hitting the endpoint.
  const debounceRef = useRef(null);
  function onType(value) {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(value), 350);
  }

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  return (
    <CustomerShell title={t('c.productsTitle')} back="/c/shops">
      <div className="card cpwa-search cpwa-search-voice">
        <input
          type="search"
          value={q}
          onChange={(e) => onType(e.target.value)}
          placeholder={t('c.searchProductsAll')}
          aria-label={t('c.searchProductsAll')}
        />
        {voiceOk && (
          <button
            type="button"
            className={`secondary cpwa-mic${voice.listening ? ' listening' : ''}`}
            onClick={voice.start}
            aria-label={t('voice.listen')}
            title={voice.listening ? t('voice.listening') : t('voice.listen')}
          >
            🎤
          </button>
        )}
      </div>
      {voiceOk && <VoiceSearchHint listening={voice.listening} hint={voice.hint} />}

      {error && <div className="card cpwa-error">{error}</div>}
      {!error && loading && <div className="card">{t('c.searching')}</div>}
      {!error && !loading && !searched && (
        <div className="card muted">{t('c.searchToStart')}</div>
      )}
      {!error && !loading && searched && products.length === 0 && (
        <div className="card muted">{t('c.noProductsFound')}</div>
      )}

      {!loading && products.map((p) => (
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
            {p.shop.distance_km != null && (
              <div className="cpwa-shopcard-meta">
                <span className="badge">{p.shop.distance_km} {t('c.kmAway')}</span>
              </div>
            )}
          </div>
          <span className="cpwa-chev">›</span>
        </Link>
      ))}
    </CustomerShell>
  );
}
