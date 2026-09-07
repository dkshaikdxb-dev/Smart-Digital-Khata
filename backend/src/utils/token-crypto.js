const crypto = require('crypto');

// AES-256-GCM symmetric encryption for OAuth tokens at rest (Batch S). OAuth
// access/refresh tokens are NEVER stored in plaintext — the callback encrypts
// them before they touch the DB and the publisher decrypts them only in-memory
// at send time. This module NEVER logs or returns the key or a plaintext token.
//
// The key comes from process.env.CONTENT_TOKEN_KEY, a 32-byte value encoded as
// hex (64 chars) or base64. If the key is absent/invalid, encryption is
// unavailable → isConfigured() is false and social publishing stays INERT (the
// channel keeps using the outbox adapter). Ciphertext format is a self-describing
// versioned string so the scheme can evolve:
//
//   "v1:<iv_b64>:<tag_b64>:<ct_b64>"
//
// decrypt() verifies the GCM authentication tag, so a TAMPERED ciphertext (any
// byte of iv/tag/ct altered) throws instead of yielding forged plaintext.

const ALGO = 'aes-256-gcm';
const IV_LEN = 12; // 96-bit nonce, the standard/recommended size for GCM
const KEY_LEN = 32; // AES-256
const VERSION = 'v1';

// Parse CONTENT_TOKEN_KEY into a 32-byte Buffer, or return null when it is
// missing or not exactly 32 bytes. Tries hex first (a 64-char hex string), then
// base64. NEVER logs the key material.
function keyBuffer() {
  const raw = process.env.CONTENT_TOKEN_KEY;
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();

  // Hex: exactly 64 hex chars → 32 bytes.
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    const buf = Buffer.from(trimmed, 'hex');
    return buf.length === KEY_LEN ? buf : null;
  }

  // Otherwise treat it as base64 (accepts standard and url-safe variants).
  try {
    const buf = Buffer.from(trimmed, 'base64');
    return buf.length === KEY_LEN ? buf : null;
  } catch {
    return null;
  }
}

// True only when a valid 32-byte key is configured — token encryption is usable.
function isConfigured() {
  return keyBuffer() !== null;
}

// encrypt(plaintext) → "v1:<iv_b64>:<tag_b64>:<ct_b64>". Throws when the key is
// absent/invalid (the caller must gate on isConfigured()) or the input is not a
// non-empty string. A fresh random IV is generated per call.
function encrypt(plaintext) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('token-crypto: plaintext must be a non-empty string');
  }
  const key = keyBuffer();
  if (!key) throw new Error('token-crypto: CONTENT_TOKEN_KEY is not configured');

  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

// decrypt("v1:iv:tag:ct") → plaintext. Throws on a malformed string, a missing
// key, or a FAILED GCM tag check (tamper). Never leaks the key or partial output.
function decrypt(payload) {
  if (typeof payload !== 'string') {
    throw new Error('token-crypto: ciphertext must be a string');
  }
  const key = keyBuffer();
  if (!key) throw new Error('token-crypto: CONTENT_TOKEN_KEY is not configured');

  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('token-crypto: unrecognised ciphertext format');
  }
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const ct = Buffer.from(parts[3], 'base64');
  if (iv.length !== IV_LEN || tag.length !== 16) {
    throw new Error('token-crypto: invalid ciphertext components');
  }

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag); // a tampered tag makes final() throw
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

module.exports = { isConfigured, encrypt, decrypt };
