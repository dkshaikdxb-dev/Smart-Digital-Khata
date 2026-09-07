import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import CustomerShell from '../../components/CustomerShell';
import { publicFetch } from '../../lib/customerApi';
import { useLang, canUseVoice, useLanguageCapability } from '../../lib/i18n';
import { useSpeech } from '../../lib/useSpeech';

// Flipkart-style quick-browse categories. The label is localized; the search
// term is the English base word so the endpoint's name-ILIKE matches whatever
// the shopkeeper actually typed. Emoji icons only (no images — keep it fast).
const CATEGORIES = [
  { key: 'catAttaRice', term: 'rice', icon: '🍚' },
  { key: 'catDairy', term: 'milk', icon: '🧈' },
  { key: 'catSnacks', term: 'biscuit', icon: '🍪' },
  { key: 'catHousehold', term: 'soap', icon: '🧼' },
  { key: 'catPersonalCare', term: 'shampoo', icon: '🧴' },
];

// Public shop directory. Search by name/city; optionally sort by distance using
// the browser geolocation. No token required — anyone can browse. A prominent
// product-search bar on top deep-links into the cross-shop product search
// (/c/products); voice is available on both that bar and the directory search.
export default function DiscoverShops() {
  const router = useRouter();
  const { t, lang } = useLang();
  const { sttSupported, listening, listen } = useSpeech();
  // Hide the mic for languages the browser can't reliably recognize (it would
  // otherwise mis-hear them as en-IN) — capability comes from Batch B's helper.
  const voiceOk = sttSupported && canUseVoice(lang, useLanguageCapability(lang));
  const [productQ, setProductQ] = useState(''); // top product-search bar
  const [search, setSearch] = useState('');
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [coords, setCoords] = useState(null); // { lat, lng }
  const [locating, setLocating] = useState(false);

  async function load(term, loc) {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams();
      if (term && term.trim()) q.set('search', term.trim());
      if (loc) {
        q.set('lat', String(loc.lat));
        q.set('lng', String(loc.lng));
      }
      q.set('limit', '50');
      const r = await publicFetch(`/api/public/shops?${q.toString()}`);
      setShops(r.shops || r.items || []);
    } catch (err) {
      setError(err.message);
      setShops([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load('', null);
  }, []);

  function onSearch(e) {
    e.preventDefault();
    load(search, coords);
  }

  // Navigate to the cross-shop product search for a term (bar submit, voice, or
  // a category chip). Empty terms are ignored.
  function goProducts(term) {
    const v = (term || '').trim();
    if (!v) return;
    router.push(`/c/products?q=${encodeURIComponent(v)}`);
  }

  function onProductSubmit(e) {
    e.preventDefault();
    goProducts(productQ);
  }

  function useMyLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError(t('c.locationUnavailable'));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(loc);
        setLocating(false);
        load(search, loc);
      },
      (err) => {
        setLocating(false);
        setError(err.message || t('c.locationError'));
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  }

  return (
    <CustomerShell title={t('c.discoverShops')}>
      {/* Prominent product search on top: submit or a voice result jumps to the
          cross-shop product search page. */}
      <form onSubmit={onProductSubmit} className="card cpwa-search">
        <div className="cpwa-search-voice">
          <input
            type="search"
            placeholder={t('c.searchProductsAll')}
            aria-label={t('c.searchProductsAll')}
            value={productQ}
            onChange={(e) => setProductQ(e.target.value)}
          />
          {voiceOk && (
            <button
              type="button"
              className={`secondary cpwa-mic${listening ? ' listening' : ''}`}
              onClick={() => listen((tx) => { setProductQ(tx); goProducts(tx); })}
              aria-label={t('voice.listen')}
              title={listening ? t('voice.listening') : t('voice.listen')}
            >
              🎤
            </button>
          )}
        </div>
        <div className="cpwa-chips" role="group" aria-label={t('c.productsTitle')}>
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              className="cpwa-chip"
              onClick={() => goProducts(c.term)}
            >
              {c.icon} {t(`c.${c.key}`)}
            </button>
          ))}
        </div>
      </form>

      <form onSubmit={onSearch} className="card cpwa-search">
        <div className="cpwa-search-voice">
          <input
            type="search"
            placeholder={t('c.searchShopsPlaceholder')}
            aria-label={t('c.searchShopsPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {voiceOk && (
            <button
              type="button"
              className={`secondary cpwa-mic${listening ? ' listening' : ''}`}
              onClick={() => listen((tx) => { setSearch(tx); load(tx, coords); })}
              aria-label={t('voice.listen')}
              title={listening ? t('voice.listening') : t('voice.listen')}
            >
              🎤
            </button>
          )}
        </div>
        <div className="cpwa-row" style={{ marginTop: 10 }}>
          <button type="submit" style={{ flex: 1 }}>{t('common.search')}</button>
          <button type="button" className="secondary" onClick={useMyLocation} disabled={locating}>
            {locating ? t('c.locating') : coords ? t('c.nearby') : t('c.useMyLocation')}
          </button>
        </div>
      </form>

      {error && <div className="card cpwa-error">{error}</div>}
      {loading && <div className="card">{t('c.loadingShops')}</div>}
      {!loading && !error && shops.length === 0 && (
        <div className="card muted">{t('c.noShops')}</div>
      )}

      {shops.map((s) => (
        <Link key={s.id} href={`/c/shop/${s.id}`} className="card cpwa-shopcard">
          <div className="cpwa-shopcard-body">
            <div className="cpwa-shopcard-name">{s.name}</div>
            <div className="muted">
              {[s.area, s.city].filter(Boolean).join(', ') || t('c.locationNotSet')}
            </div>
            <div className="cpwa-shopcard-meta">
              <span className="badge">{Number(s.product_count || 0)} {t('c.items')}</span>
              {s.distance_km != null && <span className="badge">{s.distance_km} {t('c.kmAway')}</span>}
            </div>
          </div>
          <span className="cpwa-chev">›</span>
        </Link>
      ))}
    </CustomerShell>
  );
}
