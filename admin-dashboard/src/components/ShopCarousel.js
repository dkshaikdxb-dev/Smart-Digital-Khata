import { useCallback, useEffect, useRef, useState } from 'react';
import { useDataSaver } from '../lib/useDataSaver';

// Storefront photo carousel (batch LITE). Renders a shop's up-to-3 owner photos
// where the single cover used to sit. Deliberately lightweight for weak 2G rural
// connections — CSS-only (a horizontal scroll-snap track + dots, no JS slider
// library), and DATA-SAVER-AWARE: when the app's data-saver flag is on it loads
// ONLY the first photo and never fetches the rest (the whole point of "lite").
//
//   0 photos  -> nothing (as the header rendered before any cover existed)
//   1 photo   -> a plain image, no carousel chrome
//   2-3 photos -> the scroll-snap carousel with dots
//
// The first image is eager; the rest are loading="lazy" so they only fetch as
// the shopper swipes. Auto-advance is enabled only when the viewer has NOT asked
// to reduce motion. Fixed 20/9 aspect ratio, object-fit:cover, max-width:100%.

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const resolveImg = (url) => (!url ? '' : (/^https?:\/\//i.test(url) ? url : `${API_BASE}${url}`));

export default function ShopCarousel({ images, alt = '' }) {
  const { dataSaver } = useDataSaver();
  const [activeIndex, setActiveIndex] = useState(0);
  const trackRef = useRef(null);
  const activeIndexRef = useRef(0);

  const list = Array.isArray(images) ? images.filter((im) => im && im.url) : [];
  // Data saver: show only the first photo and do NOT load the others. This is the
  // whole reason the carousel exists — no image weight on a metered connection.
  const shown = dataSaver ? list.slice(0, 1) : list;

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

  // Gentle auto-advance — ONLY when the viewer has not asked to reduce motion,
  // and only when there is more than one photo actually shown.
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

  // Single photo (or data-saver collapsed to one): render it exactly like the old
  // cover — no track, no dots.
  if (shown.length === 1) {
    return (
      <img
        className="cpwa-shopcar-single"
        src={resolveImg(shown[0].url)}
        alt={alt}
        loading="eager"
      />
    );
  }

  return (
    <div className="cpwa-shopcar">
      <div className="cpwa-shopcar-track" ref={trackRef} onScroll={onScroll}>
        {shown.map((im, i) => (
          <div className="cpwa-shopcar-slide" key={im.url}>
            <img
              className="cpwa-shopcar-img"
              src={resolveImg(im.url)}
              alt={i === 0 ? alt : ''}
              loading={i === 0 ? 'eager' : 'lazy'}
            />
          </div>
        ))}
      </div>
      <div className="cpwa-shopcar-dots" role="tablist" aria-label={alt}>
        {shown.map((im, i) => (
          <button
            key={im.url}
            type="button"
            role="tab"
            aria-selected={i === activeIndex}
            aria-label={`${i + 1} / ${shown.length}`}
            className={`cpwa-shopcar-dot${i === activeIndex ? ' active' : ''}`}
            onClick={() => scrollToSlide(i)}
          />
        ))}
      </div>
    </div>
  );
}
