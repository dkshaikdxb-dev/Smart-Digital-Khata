// Shared server-side image pipeline. Extracted from product.controller so the
// same validating "backstop" resize/re-encode serves BOTH product photos and the
// (wider) shop cover. The client ImageStudio already resizes + WebP-encodes on
// the phone for weak 2G networks; this is the server-side guarantee that whatever
// finally lands in Postgres is bounded and in a sane format even when the client
// path was skipped (old WebView) or bypassed (direct API call).
//
// sharp is loaded lazily/defensively: if the native binary is unavailable at
// runtime (e.g. an unexpected build) we fall back to storing the ORIGINAL bytes +
// original mime, exactly like the pre-refactor product controller did — so an
// upload never hard-fails on a missing/broken sharp.
let sharp = null;
try {
  // eslint-disable-next-line global-require
  sharp = require('sharp');
} catch (_e) {
  sharp = null;
}

// The image mime types the API accepts for upload. Kept here (single source of
// truth) and re-exported by the controllers that validate uploads.
const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Resize (long edge <= maxDim, never enlarged) and re-encode to WebP.
 *
 * @param {Buffer} buffer            the raw uploaded bytes
 * @param {object} [opts]
 * @param {number} [opts.maxDim=800] max width/height in px (product 800, cover 1600)
 * @param {number} [opts.quality=80] WebP quality 1..100
 * @returns {Promise<{ data: Buffer, mime: string }>}
 *
 * On any sharp failure (unavailable binary, or a payload sharp can't decode) the
 * ORIGINAL buffer + a best-effort mime are returned so the caller can still store
 * something. Callers are expected to have already validated the mime.
 */
async function processImage(buffer, opts = {}) {
  const maxDim = Number.isFinite(opts.maxDim) && opts.maxDim > 0 ? opts.maxDim : 800;
  const quality = Number.isFinite(opts.quality) && opts.quality > 0 ? opts.quality : 80;

  if (!sharp) {
    return { data: buffer, mime: opts.fallbackMime || 'application/octet-stream' };
  }
  try {
    const data = await sharp(buffer)
      .rotate() // honour EXIF orientation
      .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
    return { data, mime: 'image/webp' };
  } catch (_e) {
    // Corrupt/unsupported payload for sharp, or a missing binary — keep original.
    return { data: buffer, mime: opts.fallbackMime || 'application/octet-stream' };
  }
}

module.exports = { processImage, ALLOWED_IMAGE_MIMES };
