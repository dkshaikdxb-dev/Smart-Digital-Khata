import { useCallback, useEffect, useRef, useState } from 'react';

// ImageStudio — a self-contained, dependency-free (Canvas API only) client image
// pipeline for weak 2G networks: pick -> auto-orient (EXIF) -> resize -> aspect
// crop (cover, drag-to-reposition) -> iterative WebP encode under a byte budget
// -> preview, then hands the caller a ready-to-upload Blob.
//
// Robustness is the whole point: EVERY canvas step is guarded, and on ANY failure
// (old WebView, no 2D context, no createImageBitmap, toBlob returns null) it falls
// back to handing back the ORIGINAL File so the upload still works — the server
// `sharp` pipeline is the validating backstop that re-encodes whatever lands.
//
// SSR-safe: nothing touches window/document/canvas at module load or first
// render; all image work happens inside event handlers. No animation is used, so
// prefers-reduced-motion needs no special handling (the cropper is a static
// drag-to-reposition, not an animated transition).

const KB = 1024;
function fmtSize(bytes) {
  if (bytes == null) return '';
  if (bytes < KB) return `${bytes} B`;
  if (bytes < KB * KB) return `${Math.round(bytes / KB)} KB`;
  return `${(bytes / (KB * KB)).toFixed(1)} MB`;
}

// Promisified canvas.toBlob that never throws (returns null on any failure/absence).
function toBlobAsync(canvas, type, quality) {
  return new Promise((resolve) => {
    try {
      if (typeof canvas.toBlob === 'function') {
        canvas.toBlob((b) => resolve(b || null), type, quality);
      } else {
        resolve(null);
      }
    } catch (_e) {
      resolve(null);
    }
  });
}

// Decode a File to something drawable, honouring EXIF orientation where the
// platform supports it. Prefers createImageBitmap({imageOrientation:'from-image'})
// so a portrait phone photo is auto-rotated; falls back to a plain bitmap, then to
// FileReader+Image (no EXIF — the server .rotate() covers that case).
async function loadDrawable(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (_e) {
      try {
        return await createImageBitmap(file);
      } catch (_e2) {
        /* fall through to FileReader */
      }
    }
  }
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image decode failed'));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error('file read failed'));
      reader.readAsDataURL(file);
    } catch (e) {
      reject(e);
    }
  });
}

const drawableW = (src) => src.width || src.naturalWidth || 0;
const drawableH = (src) => src.height || src.naturalHeight || 0;

// Output crop-box dimensions for the target aspect, long edge <= maxDim, and
// never upscaled beyond what the source can cover.
function outputDims(imgW, imgH, aspect, maxDim) {
  let outW;
  let outH;
  if (aspect >= 1) {
    outW = maxDim;
    outH = Math.round(maxDim / aspect);
  } else {
    outH = maxDim;
    outW = Math.round(maxDim * aspect);
  }
  const coverScale = Math.max(outW / imgW, outH / imgH);
  if (coverScale > 1) {
    outW = Math.round(outW / coverScale);
    outH = Math.round(outH / coverScale);
  }
  return { outW: Math.max(1, outW), outH: Math.max(1, outH) };
}

// Draw the source into the canvas as a COVER crop positioned by (ox,oy) in [0,1].
function drawCover(canvas, src, outW, outH, ox, oy) {
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  const imgW = drawableW(src);
  const imgH = drawableH(src);
  const scale = Math.max(outW / imgW, outH / imgH);
  const sw = imgW * scale;
  const sh = imgH * scale;
  const dx = -(sw - outW) * ox;
  const dy = -(sh - outH) * oy;
  ctx.clearRect(0, 0, outW, outH);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, dx, dy, sw, sh);
}

export default function ImageStudio({
  aspect = 1,
  maxDim = 800,
  targetBytes = 200 * 1024,
  label,
  onReady,
}) {
  const canvasRef = useRef(null);
  const srcRef = useRef(null); // decoded ImageBitmap/Image
  const dimsRef = useRef({ outW: 0, outH: 0 });
  const offsetRef = useRef({ ox: 0.5, oy: 0.5 });
  const lastUrlRef = useRef(''); // last object URL we created (to revoke)
  const dragRef = useRef(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const [mode, setMode] = useState('empty'); // 'empty' | 'canvas' | 'file'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [beforeSize, setBeforeSize] = useState(null);
  const [afterSize, setAfterSize] = useState(null);
  const [canDrag, setCanDrag] = useState(false);
  const inputId = useRef(`imgstudio-${Math.random().toString(36).slice(2)}`).current;

  const revokeLast = useCallback(() => {
    if (lastUrlRef.current) {
      try { URL.revokeObjectURL(lastUrlRef.current); } catch (_e) { /* ignore */ }
      lastUrlRef.current = '';
    }
  }, []);

  useEffect(() => () => revokeLast(), [revokeLast]);

  // Iteratively WebP-encode the current canvas down to targetBytes with a HARD
  // quality floor of 0.5 (never below). On encode failure, fall back to the file.
  const finalize = useCallback(async (originalFile) => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    let q = 0.82;
    let blob = null;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      blob = await toBlobAsync(canvas, 'image/webp', q);
      if (!blob) break;
      if (blob.size <= targetBytes || q <= 0.5) break;
      q = Math.max(0.5, q - 0.1);
    }
    if (!blob) return false; // webp/toBlob unsupported -> caller falls back
    revokeLast();
    const url = URL.createObjectURL(blob);
    lastUrlRef.current = url;
    setAfterSize(blob.size);
    if (onReadyRef.current) onReadyRef.current(blob, url);
    return true;
  }, [targetBytes, revokeLast]);

  // Fallback: hand the ORIGINAL file straight back so upload still works.
  const useOriginal = useCallback((file) => {
    revokeLast();
    let url = '';
    try { url = URL.createObjectURL(file); lastUrlRef.current = url; } catch (_e) { url = ''; }
    setMode('file');
    setCanDrag(false);
    setAfterSize(file.size);
    if (onReadyRef.current) onReadyRef.current(file, url);
  }, [revokeLast]);

  const onPick = useCallback(async (e) => {
    const file = e.target.files && e.target.files[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    setError('');
    setBusy(true);
    setBeforeSize(file.size);
    setAfterSize(null);
    offsetRef.current = { ox: 0.5, oy: 0.5 };
    try {
      const src = await loadDrawable(file);
      const imgW = drawableW(src);
      const imgH = drawableH(src);
      if (!imgW || !imgH) throw new Error('empty image');
      srcRef.current = src;
      dimsRef.current = outputDims(imgW, imgH, aspect, maxDim);
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('no canvas');
      drawCover(canvas, src, dimsRef.current.outW, dimsRef.current.outH, 0.5, 0.5);
      setMode('canvas');
      // Drag is only meaningful when the cover crop leaves slack on some axis.
      const scale = Math.max(dimsRef.current.outW / imgW, dimsRef.current.outH / imgH);
      setCanDrag((imgW * scale - dimsRef.current.outW) > 1 || (imgH * scale - dimsRef.current.outH) > 1);
      const ok = await finalize(file);
      if (!ok) useOriginal(file);
    } catch (_err) {
      // Old WebView / no canvas / undecodable — the server sharp backstop handles it.
      useOriginal(file);
    } finally {
      setBusy(false);
    }
  }, [aspect, maxDim, finalize, useOriginal]);

  // ---- Drag-to-reposition (cover) ---------------------------------------
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const src = srcRef.current;
    if (!canvas || !src) return;
    const { outW, outH } = dimsRef.current;
    const { ox, oy } = offsetRef.current;
    try { drawCover(canvas, src, outW, outH, ox, oy); } catch (_e) { /* ignore */ }
  }, []);

  const onPointerDown = useCallback((e) => {
    if (!canDrag || mode !== 'canvas') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (_e) { /* ignore */ }
    dragRef.current = { x: e.clientX, y: e.clientY };
  }, [canDrag, mode]);

  const onPointerMove = useCallback((e) => {
    if (!dragRef.current) return;
    const canvas = canvasRef.current;
    const src = srcRef.current;
    if (!canvas || !src) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const { outW, outH } = dimsRef.current;
    const imgW = drawableW(src);
    const imgH = drawableH(src);
    const scale = Math.max(outW / imgW, outH / imgH);
    const slackX = imgW * scale - outW;
    const slackY = imgH * scale - outH;
    const ratioX = outW / rect.width;
    const ratioY = outH / rect.height;
    const dxCanvas = (e.clientX - dragRef.current.x) * ratioX;
    const dyCanvas = (e.clientY - dragRef.current.y) * ratioY;
    const cur = offsetRef.current;
    let { ox, oy } = cur;
    if (slackX > 1) ox = Math.min(1, Math.max(0, ox - dxCanvas / slackX));
    if (slackY > 1) oy = Math.min(1, Math.max(0, oy - dyCanvas / slackY));
    offsetRef.current = { ox, oy };
    dragRef.current = { x: e.clientX, y: e.clientY };
    redraw();
  }, [redraw]);

  const onPointerUp = useCallback(async (e) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    const canvas = canvasRef.current;
    if (canvas) { try { canvas.releasePointerCapture(e.pointerId); } catch (_e) { /* ignore */ } }
    // Re-encode from the repositioned crop.
    setBusy(true);
    try { await finalize(); } finally { setBusy(false); }
  }, [finalize]);

  const showPreview = mode === 'canvas' || mode === 'file';

  return (
    <div className="imgstudio">
      <label
        htmlFor={inputId}
        className="secondary imgstudio-btn"
        style={{ display: 'inline-block', cursor: busy ? 'default' : 'pointer' }}
      >
        {busy ? '…' : (label || 'Choose photo')}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        disabled={busy}
        onChange={onPick}
        style={{
          position: 'absolute', width: 1, height: 1, padding: 0,
          margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', border: 0,
        }}
      />

      <div className="imgstudio-preview" style={{ marginTop: showPreview ? 8 : 0 }}>
        {/* One canvas, always mounted (a single stable ref). It is the visible
            preview in canvas mode and a hidden scratch surface otherwise, so a
            re-pick can always draw into it. */}
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-label={label || 'Image preview'}
          style={mode === 'canvas'
            ? {
              display: 'block', maxWidth: '100%', height: 'auto',
              borderRadius: 8, touchAction: canDrag ? 'none' : 'auto',
              cursor: canDrag ? 'move' : 'default',
            }
            : { display: 'none' }}
        />
        {mode === 'file' && lastUrlRef.current && (
          <img
            src={lastUrlRef.current}
            alt={label || 'Image preview'}
            style={{ display: 'block', maxWidth: '100%', height: 'auto', borderRadius: 8 }}
          />
        )}
        {showPreview && (beforeSize != null || afterSize != null) && (
          <div className="muted imgstudio-sizes" style={{ marginTop: 6, fontSize: 12 }}>
            {beforeSize != null && <span>{fmtSize(beforeSize)}</span>}
            {beforeSize != null && afterSize != null && <span> → </span>}
            {afterSize != null && <span>{fmtSize(afterSize)}</span>}
            {mode === 'canvas' && canDrag && <span> · drag to reposition</span>}
          </div>
        )}
      </div>
      {error && <div className="cat-photo-err" style={{ marginTop: 6 }}>{error}</div>}
    </div>
  );
}
