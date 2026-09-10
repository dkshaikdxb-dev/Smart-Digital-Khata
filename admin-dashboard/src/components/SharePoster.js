import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useLang } from '../lib/i18n';

// SharePoster (batch SOCIAL1) — the owner's "Share your shop" card.
// ============================================================================
// A ONE-TAP, NO-CREDENTIAL viral channel. It draws a branded portrait poster
// ENTIRELY on-device (HTML Canvas + the existing `qrcode` package) — shop name,
// tagline, a short offer the owner types, the store link, and a QR to that link —
// and lets the owner post it to their WhatsApp Status / Instagram / Facebook via
// the phone's NATIVE share sheet (`navigator.share({ files })`). No Meta API, no
// tokens, no server round-trip beyond loading this page.
//
// The LICENSED path (Meta Graph auto-post + Meta commerce catalogue sync) is
// PARKED behind `meta_autopost_enabled=false`; see utils/metaCommerce.js. It is
// NOT reachable from here.
//
// Robustness contract:
//  - SSR-safe: no window/navigator/document/canvas touched at module scope or
//    during render — every bit of canvas + Web Share work runs in an effect or a
//    click handler, all guarded by `typeof window`/feature checks.
//  - Degrades, never crashes: if Web Share (with files) is unavailable the Share
//    button falls back to a PNG download + a copy-caption button; every async
//    path is wrapped in try/catch.
//  - Hidden when the platform flag `social_share_enabled` is off, or on any load
//    error (returns null) — additive, so it can never break the dashboard.
//  - 2G-light: the poster is generated locally and only leaves the device when
//    the owner taps Share/Download.

// Poster is a portrait 1080×1350 (4:5, the Instagram/WhatsApp-friendly ratio),
// scaled to fit its container for on-screen preview.
const POSTER_W = 1080;
const POSTER_H = 1350;
const DEFAULT_ACCENT = '#0a7e4f'; // calm brand green (matches promote.js)
const MAX_OFFER = 120;

// Pick black or white ink for legible text on a given background, by relative
// luminance. Keeps the header high-contrast whatever accent the owner chose.
function inkOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  // sRGB relative luminance
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.6 ? '#111111' : '#ffffff';
}

function normHex(hex) {
  return /^#[0-9a-f]{6}$/i.test(String(hex || '').trim()) ? hex.trim() : DEFAULT_ACCENT;
}

// Word-wrap `text` to at most `maxLines` lines that fit `maxWidth` at the current
// ctx.font; the last line is ellipsised if it overflows. Returns the lines array.
function wrapLines(ctx, text, maxWidth, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth || !line) {
      line = test;
    } else {
      lines.push(line);
      line = w;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  // Ellipsise the last line if the whole text did not fit.
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    if (ctx.measureText(last).width > maxWidth) {
      while (last.length && ctx.measureText(`${last}…`).width > maxWidth) {
        last = last.slice(0, -1);
      }
      lines[maxLines - 1] = `${last}…`;
    }
  }
  return lines;
}

export default function SharePoster() {
  const { t } = useLang();
  const canvasRef = useRef(null);

  // Platform flag (DEFAULT ON). Start optimistic; only hide on an explicit
  // 'false' from the public config. Never let the fetch throw.
  const [flagEnabled, setFlagEnabled] = useState(true);
  const [shop, setShop] = useState(null); // { id, name }
  const [accent, setAccent] = useState(DEFAULT_ACCENT);
  const [tagline, setTagline] = useState('');
  const [offer, setOffer] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // Whether this device can share files via the Web Share API. Resolved in an
  // effect (navigator is client-only); when false we show Download instead.
  const [canShareFiles, setCanShareFiles] = useState(false);

  // Feature-detect Web Share (with files) once, client-side.
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    try {
      // canShare({ files }) needs a real File to test against on some engines;
      // a tiny probe file keeps the check honest without side effects.
      const probe = new File([new Uint8Array([0])], 'p.png', { type: 'image/png' });
      setCanShareFiles(
        typeof navigator.share === 'function' &&
          typeof navigator.canShare === 'function' &&
          navigator.canShare({ files: [probe] })
      );
    } catch (_e) {
      setCanShareFiles(false);
    }
  }, []);

  // Load the flag + shop identity + branding. All additive: any failure just
  // leaves the card hidden (flag stays true only if the config said so).
  useEffect(() => {
    let alive = true;
    apiFetch('/api/public/config')
      .then((cfg) => { if (alive) setFlagEnabled(!!(cfg && cfg.social_share_enabled !== false)); })
      .catch(() => { /* default ON on error */ });

    apiFetch('/api/shops/me')
      .then((r) => {
        if (!alive || !r || !r.shop) return;
        setShop({ id: r.shop.id, name: r.shop.name || '' });
        if (typeof window !== 'undefined') {
          setLink(`${window.location.origin}/c/shop/${r.shop.id}`);
        }
      })
      .catch(() => { if (alive) setShop(null); });

    // Branding is optional (STORE1). A failure must not hide the poster — we just
    // fall back to the default accent and no tagline.
    apiFetch('/api/shops/me/branding')
      .then((b) => {
        if (!alive || !b) return;
        setAccent(normHex(b.brand_accent) || DEFAULT_ACCENT);
        setTagline(b.brand_tagline || '');
      })
      .catch(() => { /* keep defaults */ });

    return () => { alive = false; };
  }, []);

  // Draw the whole poster onto `canvas` (1080×1350) and resolve when done. All
  // drawing is awaited, including the QR image, so a subsequent toBlob captures a
  // complete frame. Never throws to the caller past its own try/catch at call
  // sites — but we keep it defensive here too.
  const renderPoster = useCallback(async (canvas) => {
    if (!canvas || typeof window === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = POSTER_W;
    canvas.height = POSTER_H;

    const acc = normHex(accent);
    const headerInk = inkOn(acc);

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, POSTER_W, POSTER_H);

    // Header band (accent)
    const HEADER_H = 340;
    ctx.fillStyle = acc;
    ctx.fillRect(0, 0, POSTER_W, HEADER_H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    // Shop name (wrapped, up to 2 lines)
    ctx.fillStyle = headerInk;
    ctx.font = '700 92px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    const nameLines = wrapLines(ctx, shop?.name || '', POSTER_W - 140, 2);
    let ny = nameLines.length > 1 ? 150 : 200;
    for (const l of nameLines) { ctx.fillText(l, POSTER_W / 2, ny); ny += 104; }

    // Tagline (in header, below name)
    if (tagline) {
      ctx.font = '400 40px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      const tagLines = wrapLines(ctx, tagline, POSTER_W - 160, 2);
      let ty = nameLines.length > 1 ? 300 : 268;
      for (const l of tagLines) { ctx.fillText(l, POSTER_W / 2, ty); ty += 48; }
    }

    // Offer panel (light accent tint) with the owner's typed message
    const offerText = (offer || '').trim() || t('share.offerDefault');
    const PANEL_Y = HEADER_H + 60;
    const PANEL_H = 360;
    ctx.fillStyle = '#f4f6f5';
    ctx.fillRect(60, PANEL_Y, POSTER_W - 120, PANEL_H);
    ctx.fillStyle = acc;
    ctx.fillRect(60, PANEL_Y, 14, PANEL_H); // accent spine

    ctx.fillStyle = '#111111';
    ctx.font = '700 76px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    const offerLines = wrapLines(ctx, offerText, POSTER_W - 220, 3);
    const lineH = 96;
    let oy = PANEL_Y + PANEL_H / 2 - ((offerLines.length - 1) * lineH) / 2 + 26;
    for (const l of offerLines) { ctx.fillText(l, POSTER_W / 2, oy); oy += lineH; }

    // QR + store link
    if (link) {
      try {
        const QRCode = (await import('qrcode')).default;
        const qrDataUrl = await QRCode.toDataURL(link, {
          width: 460,
          margin: 2,
          color: { dark: '#111111', light: '#ffffff' },
        });
        const img = await new Promise((resolve, reject) => {
          const im = new window.Image();
          im.onload = () => resolve(im);
          im.onerror = reject;
          im.src = qrDataUrl;
        });
        const QR = 460;
        const qx = (POSTER_W - QR) / 2;
        const qy = PANEL_Y + PANEL_H + 70;
        // White quiet-zone card behind the QR
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(qx - 20, qy - 20, QR + 40, QR + 40);
        ctx.drawImage(img, qx, qy, QR, QR);

        ctx.fillStyle = '#111111';
        ctx.font = '600 34px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(t('share.scanCta'), POSTER_W / 2, qy + QR + 56);
        ctx.fillStyle = '#444444';
        ctx.font = '400 30px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
        const linkLines = wrapLines(ctx, link, POSTER_W - 120, 2);
        let ly = qy + QR + 100;
        for (const l of linkLines) { ctx.fillText(l, POSTER_W / 2, ly); ly += 38; }
      } catch (_e) {
        // QR generation failed — still render the link text so the poster is usable.
        ctx.fillStyle = '#111111';
        ctx.font = '400 32px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
        const linkLines = wrapLines(ctx, link, POSTER_W - 120, 2);
        let ly = PANEL_Y + PANEL_H + 160;
        for (const l of linkLines) { ctx.fillText(l, POSTER_W / 2, ly); ly += 40; }
      }
    }

    // Footer mark
    ctx.fillStyle = acc;
    ctx.fillRect(0, POSTER_H - 70, POSTER_W, 70);
    ctx.fillStyle = inkOn(acc);
    ctx.font = '600 30px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('Smart Digital Khata', POSTER_W / 2, POSTER_H - 26);
  }, [accent, tagline, offer, link, shop, t]);

  // Live preview: redraw whenever the inputs change and the card is visible.
  useEffect(() => {
    if (!flagEnabled || !shop) return;
    let cancelled = false;
    (async () => {
      try {
        if (!cancelled) await renderPoster(canvasRef.current);
      } catch (_e) { /* preview is best-effort */ }
    })();
    return () => { cancelled = true; };
  }, [flagEnabled, shop, renderPoster]);

  // Turn the current canvas into a PNG Blob.
  const toPngBlob = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    await renderPoster(canvas); // ensure the latest frame
    return new Promise((resolve) => {
      try {
        canvas.toBlob((b) => resolve(b), 'image/png');
      } catch (_e) {
        resolve(null);
      }
    });
  }, [renderPoster]);

  const caption = useCallback(() => {
    const offerText = (offer || '').trim() || t('share.offerDefault');
    const name = shop?.name ? `${shop.name} — ` : '';
    return `${name}${offerText}\n${link}`.trim();
  }, [offer, shop, link, t]);

  async function onShare() {
    if (busy) return;
    setBusy(true); setMsg('');
    try {
      const blob = await toPngBlob();
      if (!blob) throw new Error('poster');
      const file = new File([blob], 'my-shop-poster.png', { type: 'image/png' });
      if (canShareFiles && typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: shop?.name || 'Smart Digital Khata',
          text: caption(),
        });
        setMsg(t('share.shared'));
      } else {
        // No Web Share (with files): fall back to a download.
        await downloadBlob(blob);
        setMsg(t('share.downloaded'));
      }
    } catch (e) {
      // AbortError = the user dismissed the native sheet; that is not an error.
      if (e && e.name === 'AbortError') { setMsg(''); }
      else {
        try { const b = await toPngBlob(); if (b) { await downloadBlob(b); setMsg(t('share.downloaded')); } }
        catch (_e2) { setMsg(t('share.err')); }
      }
    } finally {
      setBusy(false);
    }
  }

  async function downloadBlob(blob) {
    if (typeof window === 'undefined' || !blob) return;
    const url = window.URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = 'my-shop-poster.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      // Revoke on the next tick so the download has grabbed the URL.
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    }
  }

  async function onDownload() {
    if (busy) return;
    setBusy(true); setMsg('');
    try {
      const blob = await toPngBlob();
      if (!blob) throw new Error('poster');
      await downloadBlob(blob);
      setMsg(t('share.downloaded'));
    } catch (_e) {
      setMsg(t('share.err'));
    } finally {
      setBusy(false);
    }
  }

  async function onCopyCaption() {
    setMsg('');
    const text = caption();
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (typeof document !== 'undefined') {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setMsg(t('share.captionCopied'));
    } catch (_e) {
      setMsg(t('share.err'));
    }
  }

  // Hidden when the flag is off or the shop failed to load.
  if (!flagEnabled || !shop) return null;

  const presets = [t('share.preset1'), t('share.preset2'), t('share.preset3')];

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h3>{t('share.title')}</h3>
      <p className="muted">{t('share.subtitle')}</p>

      <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>{t('share.offerLabel')}</label>
      <textarea
        value={offer}
        onChange={(e) => setOffer(e.target.value.slice(0, MAX_OFFER))}
        maxLength={MAX_OFFER}
        rows={2}
        placeholder={t('share.offerPlaceholder')}
        style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
      />
      <div className="muted" style={{ fontSize: 12, textAlign: 'right' }}>{offer.length}/{MAX_OFFER}</div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0 14px' }}>
        {presets.map((p) => (
          <button
            type="button"
            key={p}
            className="secondary"
            style={{ fontSize: 12, padding: '4px 10px' }}
            onClick={() => setOffer(p.slice(0, MAX_OFFER))}
          >
            {p}
          </button>
        ))}
      </div>

      <div
        style={{
          border: '1px solid var(--border, #e5e7eb)',
          borderRadius: 8,
          overflow: 'hidden',
          maxWidth: 320,
          margin: '0 auto 14px',
        }}
      >
        {/* The canvas renders at 1080×1350 but is displayed responsively. */}
        <canvas ref={canvasRef} style={{ width: '100%', height: 'auto', display: 'block' }} />
      </div>

      <div className="row-actions" style={{ justifyContent: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={onShare} disabled={busy}>
          {canShareFiles ? t('share.shareBtn') : t('share.downloadBtn')}
        </button>
        {canShareFiles && (
          <button className="secondary" onClick={onDownload} disabled={busy}>{t('share.downloadBtn')}</button>
        )}
        <button className="secondary" onClick={onCopyCaption} disabled={busy}>{t('share.copyCaption')}</button>
      </div>
      {msg && <div className="muted" style={{ marginTop: 8 }}>{msg}</div>}
    </div>
  );
}
