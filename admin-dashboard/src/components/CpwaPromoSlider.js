import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { publicFetch } from '../lib/customerApi';
import { useLang } from '../lib/i18n';
import { useDataSaver } from '../lib/useDataSaver';
import { fireBeacon, followPromoLink } from '../lib/promoLink';

// Consumer promo band (batch ADS5) — the visible finale of the geo-targeted promo
// system. Sits on the home screen between search and categories. It fetches the
// localized, geo-matched, active promo slides for the shopper's saved location
// from the public serving API (Batch 4) and renders up to five as a swipeable,
// scroll-snapping band with dots. Every slide is Sponsored-labelled. When there
// are no live promos for this location — or the fetch fails — it renders NOTHING,
// so the home screen is unchanged. Lightweight: no new fonts/images/deps, all
// colours from the --c-* theme tokens so it works in Light/Dark/Warm and the
// standard/gaon layouts, and RTL-safe.
//
// The beacons (impression/click) and the link_type → destination rule live in
// lib/promoLink.js, shared with the storefront sponsored slide (ShopCarousel).

const LOC_KEY = 'skhata-loc';
const MAX_SLIDES = 5;

// Neutral per-style glyph fallbacks — used when a promo carries no glyph and no
// (usable) image. Emoji only, so there is nothing to download.
const DEFAULT_GLYPH = {
  offer: '🏷️',
  product: '🛍️',
  shop: '🏪',
  festival: '🎉',
};

// The base URL that customerApi's publicFetch targets — used to resolve a
// relative promo image_url.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Read the shopper's saved location (Batch 1's CpwaLocationPicker persisted
// `skhata-loc = {town,village,pincode}`). SSR-guarded and defensive: a blocked
// store, absent value, or malformed JSON all resolve to empties, so we still call
// the API (which then returns only district-wide `all` promos).
function readLoc() {
  const empty = { town: '', village: '', pincode: '' };
  if (typeof window === 'undefined') return empty;
  try {
    const raw = window.localStorage.getItem(LOC_KEY);
    if (!raw) return empty;
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object') return empty;
    return {
      town: typeof v.town === 'string' ? v.town : '',
      village: typeof v.village === 'string' ? v.village : '',
      pincode: typeof v.pincode === 'string' ? v.pincode : '',
    };
  } catch (e) {
    return empty;
  }
}

export default function CpwaPromoSlider() {
  const { t, lang } = useLang();
  const { dataSaver } = useDataSaver();
  const router = useRouter();
  const [promos, setPromos] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const trackRef = useRef(null);
  const activeIndexRef = useRef(0);
  const firedRef = useRef(new Set()); // promo ids that already sent an impression
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Fetch localized, geo-matched promos. The saved location is read fresh from
  // localStorage at fetch time; empty result or any error → clear → the band
  // renders nothing.
  const loadPromos = useCallback(() => {
    const loc = readLoc();
    const q = new URLSearchParams();
    if (lang) q.set('lang', lang);
    if (loc.town) q.set('town', loc.town);
    if (loc.village) q.set('village', loc.village);
    if (loc.pincode) q.set('pincode', loc.pincode);
    return publicFetch(`/api/public/promos?${q.toString()}`)
      .then((r) => {
        if (!mountedRef.current) return;
        const list = r && Array.isArray(r.promos) ? r.promos.slice(0, MAX_SLIDES) : [];
        setPromos(list);
      })
      .catch(() => {
        if (mountedRef.current) setPromos([]);
      });
  }, [lang]);

  // Run on mount + language change, and re-run immediately when the shopper
  // changes their saved location in the picker (CpwaLocationPicker dispatches
  // the 'skhata:location-changed' event on save).
  useEffect(() => {
    loadPromos();
    if (typeof window === 'undefined') return undefined;
    const onLoc = () => loadPromos();
    window.addEventListener('skhata:location-changed', onLoc);
    return () => window.removeEventListener('skhata:location-changed', onLoc);
  }, [loadPromos]);

  // Track scroll position → active dot. Uses the inline-start edge so it is
  // correct in both LTR and RTL (Urdu) without special-casing browser scrollLeft.
  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el || !el.children.length) return;
    const rtl = typeof window !== 'undefined' && window.getComputedStyle
      ? window.getComputedStyle(el).direction === 'rtl'
      : false;
    const trackRect = el.getBoundingClientRect();
    const edge = rtl ? trackRect.right : trackRect.left;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < el.children.length; i += 1) {
      const r = el.children[i].getBoundingClientRect();
      const slideEdge = rtl ? r.right : r.left;
      const dist = Math.abs(slideEdge - edge);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    activeIndexRef.current = best;
    setActiveIndex(best);
  }, []);

  const scrollToSlide = useCallback((i) => {
    const el = trackRef.current;
    if (!el) return;
    const target = el.children[i];
    if (target && target.scrollIntoView) {
      target.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    }
  }, []);

  // Impression beacons: fire once per promo per mount, when the slide first
  // scrolls at least half into view. A fresh promo set (new fetch) resets the
  // fired-set so its slides can record their own impressions.
  useEffect(() => {
    firedRef.current = new Set();
    const el = trackRef.current;
    if (!el || !promos.length) return undefined;
    const fire = (id) => {
      if (id && !firedRef.current.has(id)) {
        firedRef.current.add(id);
        fireBeacon(id, 'impression');
      }
    };
    if (typeof IntersectionObserver === 'undefined') {
      // No observer support — count everything rendered as seen, once.
      promos.forEach((p) => fire(p.id));
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) fire(entry.target.getAttribute('data-promo-id'));
        });
      },
      { root: el, threshold: 0.5 }
    );
    Array.from(el.children).forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [promos]);

  // Gentle auto-advance — ONLY when the viewer has not asked to reduce motion.
  useEffect(() => {
    if (promos.length <= 1) return undefined;
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: no-preference)');
    if (!mq.matches) return undefined;
    const id = setInterval(() => {
      const el = trackRef.current;
      if (!el || !el.children.length) return;
      const next = (activeIndexRef.current + 1) % el.children.length;
      scrollToSlide(next);
    }, 5000);
    return () => clearInterval(id);
  }, [promos.length, scrollToSlide]);

  // Tap a slide → click beacon (fire-and-forget) then navigate by link_type
  // (the shared rule in lib/promoLink.js).
  const onSlideClick = useCallback(
    (p) => {
      fireBeacon(p.id, 'click');
      followPromoLink(router, p);
    },
    [router]
  );

  // Self-hide: no live promos for this location, or the fetch failed.
  if (!promos.length) return null;

  return (
    <section className="cpwa-promo" aria-label={t('c.promo.sponsored')}>
      <div className="cpwa-promo-track" ref={trackRef} onScroll={onScroll}>
        {promos.map((p) => {
          const style = DEFAULT_GLYPH[p.style] ? p.style : 'offer';
          const glyph = p.glyph || DEFAULT_GLYPH[style] || '📣';
          const showImage = style === 'product' && !!p.image_url && !dataSaver;
          const src = /^https?:\/\//i.test(p.image_url || '')
            ? p.image_url
            : `${API_BASE}${p.image_url || ''}`;
          return (
            <button
              key={p.id}
              type="button"
              className={`cpwa-promo-slide cpwa-promo--${style}`}
              data-promo-id={p.id}
              onClick={() => onSlideClick(p)}
            >
              <span className="cpwa-promo-badge">{t('c.promo.sponsored')}</span>
              <span className="cpwa-promo-media" aria-hidden="true">
                {showImage ? (
                  <img
                    className="cpwa-promo-img"
                    src={src}
                    alt=""
                    loading="lazy"
                    width="72"
                    height="72"
                  />
                ) : (
                  <span className="cpwa-promo-glyph">{glyph}</span>
                )}
              </span>
              <span className="cpwa-promo-body">
                {(style === 'offer' || style === 'festival') && p.offer_text && (
                  <span className="cpwa-promo-offer">{p.offer_text}</span>
                )}
                {p.title && <span className="cpwa-promo-title">{p.title}</span>}
                {(style === 'product' || style === 'shop') && p.offer_text && (
                  <span className="cpwa-promo-sub">{p.offer_text}</span>
                )}
                {(style === 'offer' || style === 'shop') && p.subtitle && (
                  <span className="cpwa-promo-sub">{p.subtitle}</span>
                )}
                {p.advertiser && <span className="cpwa-promo-adv">{p.advertiser}</span>}
              </span>
            </button>
          );
        })}
      </div>
      {promos.length > 1 && (
        <div className="cpwa-promo-dots" role="tablist" aria-label={t('c.promo.sponsored')}>
          {promos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={i === activeIndex}
              aria-label={`${i + 1} / ${promos.length}`}
              className={`cpwa-promo-dot${i === activeIndex ? ' active' : ''}`}
              onClick={() => scrollToSlide(i)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
