import { useEffect, useState } from 'react';
import Link from 'next/link';
import CustomerShell from '../../components/CustomerShell';
import { publicFetch } from '../../lib/customerApi';
import { useLang } from '../../lib/i18n';

// Public shop directory. Search by name/city; optionally sort by distance using
// the browser geolocation. No token required — anyone can browse.
export default function DiscoverShops() {
  const { t } = useLang();
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
      <form onSubmit={onSearch} className="card cpwa-search">
        <input
          type="search"
          placeholder={t('c.searchShopsPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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
