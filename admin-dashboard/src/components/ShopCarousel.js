import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useDataSaver } from '../lib/useDataSaver';
import { useLang } from '../lib/i18n';
import { fireBeacon, followPromoLink } from '../lib/promoLink';

// Storefront slider (batch LITE → FULL). Renders a shop's `slides` — the owner's
// up-to-3 moderated photos plus AT MOST ONE sponsored slide the server composed
// into the second slot — where the single cover used to sit. Deliberately
// lightweight for weak 2G rural connections — CSS-only (a horizontal scroll-snap
// track + dots, no JS slider library), and DATA-SAVER-AWARE: when the app's
// data-saver flag is on it shows ONLY the first OWNER photo and never the
// sponsored slide (no ad weight, no extra fetch on a metered connection).
//
//   slides: [{type:'photo', url}] | [{type:'sponsored', campaign_id, title,
//           offer_text, subtitle, glyph, image_url, link_*}]
//   images: legacy [{url}] — used when `slides` is absent (older API / callers)
//
//   0 slides   -> nothing (as the header rendered before any cover existed)
//   1 slide    -> a plain image (or the lone sponsored card), no carousel chrome
//   2+ slides  -> the scroll-snap carousel with dots
//
// The first image is eager; the rest are loading="lazy" so they only fetch as
// the shopper swipes. Auto-advance is enabled only when the viewer has NOT asked
// to reduce motion. Fixed 20/9 aspect ratio, object-fit:cover, max-width:100%.
// The sponsored card fires the SAME impression (once, when at least half in
// view) and click beacons as the discovery band and follows the SAME link rule
// (lib/promoLink.js). It always carries a small "Sponsored" tag.

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const resolveImg = (url) => (!url ? '' : (/^https?:\/\//i.test(url) ? url : `${API_BASE}${url}`));

// Normalize the props into one slide list: `slides` when present, else the
// legacy `images` as photo slides. Drops anything without a usable url/id.
function toSlides(slides, images) {
  if (Array.isArray(slides)) {
    return slides.filter((s) => s && ((s.type === 'photo' && s.url) || (s.type === 'sponsored' && s.campaign_id)));
  }
  return (Array.isArray(images) ? images : [])
    .filter((im) => im && im.url)
    .map((im) => ({ type: 'photo', url: im.url }));
}

const slideKey = (s) => (s.type === 'sponsored' ? `sp:${s.campaign_id}` : `ph:${s.url}`);

// The sponsored card: gradient + glyph (or the optional image when not on data
// saver — but data saver never shows this card at all) + localized title /
// offer / subtitle and the Sponsored tag. A <button> so it is keyboard/AT
// reachable; the click beacon + link follow happen in the parent handler.
function SponsoredSlide({ s, label, onClick }) {
  const src = resolveImg(s.image_url);
  return (
    <button
      type="button"
      className="cpwa-shopcar-sponsored"
      data-campaign-id={s.campaign_id}
      onClick={onClick}
      aria-label={`${label}: ${s.title || ''}`}
    >
      <span className="cpwa-shopcar-sponsored-tag">{label}</span>
      <span className="cpwa-shopcar-sponsored-media" aria-hidden="true">
        {src ? (
          <img className="cpwa-shopcar-sponsored-img" src={src} alt="" loading="lazy" width="72" height="72" />
        ) : (
          <span className="cpwa-shopcar-sponsored-glyph">{s.glyph || '📣'}</span>
        )}
      </span>
      <span className="cpwa-shopcar-sponsored-body">
        {s.offer_text && <span className="cpwa-shopcar-sponsored-offer">{s.offer_text}</span>}
        {s.title && <span className="cpwa-shopcar-sponsored-title">{s.title}</span>}
        {s.subtitle && <span className="cpwa-shopcar-sponsored-sub">{s.subtitle}</span>}
      </span>
    </button>
  );
}

export default function ShopCarousel({ slides, images, alt = '' }) {
  const { dataSaver } = useDataSaver();
  const { t } = useLang();
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(0);
  const trackRef = useRef(null);
  const activeIndexRef = useRef(0);
  const firedRef = useRef(new Set()); // campaign ids that already sent an impression

  const list = toSlides(slides, images);
  // Data saver: show only the first OWNER photo, never the sponsored slide, and
  // do NOT load the others. This is the whole reason the carousel exists — no
  // image (or ad) weight on a metered connection.
  const shown = dataSaver ? list.filter((s) => s.type === 'photo').slice(0, 1) : list;
  const sponsoredLabel = t('c.promo.sponsored');

  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el || !el.children.length) return;
    const trackLeft = el.getBoundingClientRect().left;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < el.children.length; i += 1) {
      const dist = Math.abs(el.children[i].getBoundingClientRect().left - trackLeft);
      if (dist < bestDist) { bestDist = dist; best = i; }
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

  // Sponsored click → click beacon (fire-and-forget) then the shared link rule.
  const onSponsoredClick = useCallback((s) => {
    fireBeacon(s.campaign_id, 'click');
    followPromoLink(router, s);
  }, [router]);

  // Impression beacon: once per campaign per mount, when the sponsored card is
  // at least half in view (or immediately when it is the only slide / there is
  // no IntersectionObserver). Keyed on the campaign so a re-render never
  // double-counts; a new shop (new slide set) resets the fired-set.
  const sponsoredIds = shown.filter((s) => s.type === 'sponsored').map((s) => s.campaign_id).join(',');
  useEffect(() => {
    firedRef.current = new Set();
    if (!sponsoredIds) return undefined;
    const fire = (id) => {
      if (id && !firedRef.current.has(id)) {
        firedRef.current.add(id);
        fireBeacon(id, 'impression');
      }
    };
    const el = trackRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      // Single-slide render (no track) or no observer support — the card is on
      // screen as soon as it is painted, so count it once.
      sponsoredIds.split(',').forEach(fire);
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) fire(entry.target.getAttribute('data-campaign-id'));
        });
      },
      { root: el, threshold: 0.5 }
    );
    Array.from(el.querySelectorAll('[data-campaign-id]')).forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [sponsoredIds]);

  // Gentle auto-advance — ONLY when the viewer has not asked to reduce motion,
  // and only when there is more than one slide actually shown.
  useEffect(() => {
    if (shown.length <= 1) return undefined;
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: no-preference)');
    if (!mq.matches) return undefined;
    const id = setInterval(() => {
      const el = trackRef.current;
      if (!el || !el.children.length) return;
      scrollToSlide((activeIndexRef.current + 1) % el.children.length);
    }, 5000);
    return () => clearInterval(id);
  }, [shown.length, scrollToSlide]);

  if (!shown.length) return null;

  // Single slide (or data-saver collapsed to one photo): render it exactly like
  // the old cover — no track, no dots. A lone sponsored card (shop without
  // photos) renders as the card alone.
  if (shown.length === 1) {
    const only = shown[0];
    if (only.type === 'sponsored') {
      return (
        <div className="cpwa-shopcar cpwa-shopcar-lone">
          <SponsoredSlide s={only} label={sponsoredLabel} onClick={() => onSponsoredClick(only)} />
        </div>
      );
    }
    return (
      <img
        className="cpwa-shopcar-single"
        src={resolveImg(only.url)}
        alt={alt}
        loading="eager"
      />
    );
  }

  return (
    <div className="cpwa-shopcar">
      <div className="cpwa-shopcar-track" ref={trackRef} onScroll={onScroll}>
        {shown.map((s, i) => (
          <div className="cpwa-shopcar-slide" key={slideKey(s)}>
            {s.type === 'sponsored' ? (
              <SponsoredSlide s={s} label={sponsoredLabel} onClick={() => onSponsoredClick(s)} />
            ) : (
              <img
                className="cpwa-shopcar-img"
                src={resolveImg(s.url)}
                alt={i === 0 ? alt : ''}
                loading={i === 0 ? 'eager' : 'lazy'}
              />
            )}
          </div>
        ))}
      </div>
      <div className="cpwa-shopcar-dots" role="tablist" aria-label={alt}>
        {shown.map((s, i) => (
          <button
            key={slideKey(s)}
            type="button"
            role="tab"
            aria-selected={i === activeIndex}
            aria-label={s.type === 'sponsored' ? `${i + 1} / ${shown.length} · ${sponsoredLabel}` : `${i + 1} / ${shown.length}`}
            className={`cpwa-shopcar-dot${i === activeIndex ? ' active' : ''}${s.type === 'sponsored' ? ' sponsored' : ''}`}
            onClick={() => scrollToSlide(i)}
          />
        ))}
      </div>
    </div>
  );
}
