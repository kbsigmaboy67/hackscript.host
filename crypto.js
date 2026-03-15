/**
 * crypto.js — HackTerminal Crypto Engine
 *
 * Mirrors xs--0.vercel.app capabilities as callable JS functions:
 *   AES-256-GCM encryption/decryption (text, files, binary)
 *   PBKDF2-SHA256 key derivation (600,000 iterations)
 *   .vlt file format (4B magic + 12B IV + 32B salt + ciphertext + 16B auth tag)
 *   Steganography via 256 invisible Unicode codepoints
 *   VLT Bundle format for multi-file packaging
 *   SHA-256/384/512 hashing
 *   Passphrase generation (random chars / word-based / PIN)
 *   Passphrase strength scoring
 *   Key export/import (.vkey format)
 *
 * All operations use the native Web Crypto API — nothing leaves the browser.
 */

'use strict';

const VaultCrypto = (() => {

  /* ─── Constants ─────────────────────────────────────────── */
  const MAGIC        = new Uint8Array([0x56, 0x4C, 0x54, 0x21]); // "VLT!"
  const BUNDLE_MAGIC = new Uint8Array([0x56, 0x42, 0x4E, 0x44]); // "VBND"
  const IV_LEN       = 12;
  const SALT_LEN     = 32;
  const TAG_LEN      = 16;
  const KDF_ITERS    = 600_000;
  const KDF_HASH     = 'SHA-256';
  const ALGO         = 'AES-GCM';
  const KEY_LEN      = 256;

  /* ─── Invisible Unicode stego map ───────────────────────── */
  // 256 codepoints split across:
  //   U+E0020–U+E007E  (Tag block, 95 chars)
  //   U+FE00–U+FE0F    (Variation selectors, 16 chars)
  //   U+200B–U+200F    (Zero-width marks, 5 chars)
  //   U+2060–U+206F    (Word joiner block, 16 chars)
  //   Remainder padded from U+E0080 tag block continuation
  const buildStegoMap = () => {
    const cps = [];
    for (let i = 0xE0020; i <= 0xE007E; i++) cps.push(i);   // 95
    for (let i = 0xFE00;  i <= 0xFE0F;  i++) cps.push(i);   // 16
    for (let i = 0x200B;  i <= 0x200F;  i++) cps.push(i);   // 5
    for (let i = 0x2060;  i <= 0x206F;  i++) cps.push(i);   // 16
    for (let i = 0xE0080; cps.length < 256; i++) cps.push(i); // fill to 256
    return cps;
  };
  const STEGO_MAP = buildStegoMap();
  // Separator: U+E007F TAG DELETE (zero visible width)
  const STEGO_SEP = String.fromCodePoint(0xE007F);

  /* ─── Utility ───────────────────────────────────────────── */
  const randBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

  const buf2hex = (buf) =>
    Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');

  const hex2buf = (hex) =>
    new Uint8Array(hex.match(/.{2}/g).map(h => parseInt(h,16))).buffer;

  const str2buf = (str) => new TextEncoder().encode(str).buffer;
  const buf2str = (buf) => new TextDecoder().decode(buf);

  const b64enc = (buf) => {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  };
  const b64dec = (str) => {
    const bin = atob(str);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  };

  const concatBuffers = (...bufs) => {
    const views = bufs.map(b => new Uint8Array(b));
    const total = views.reduce((s, v) => s + v.byteLength, 0);
    const out   = new Uint8Array(total);
    let off = 0;
    for (const v of views) { out.set(v, off); off += v.byteLength; }
    return out.buffer;
  };

  /* ─── Key derivation ────────────────────────────────────── */
  async function deriveKey(passphrase, salt) {
    const raw = await crypto.subtle.importKey(
      'raw', str2buf(passphrase), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: new Uint8Array(salt), iterations: KDF_ITERS, hash: KDF_HASH },
      raw,
      { name: ALGO, length: KEY_LEN },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /* ─── Text encrypt/decrypt ──────────────────────────────── */

  /**
   * Encrypt a UTF-8 string with AES-256-GCM.
   * Returns a Base64-encoded .vlt payload string.
   */
  async function encryptText(plaintext, passphrase) {
    const iv   = randBytes(IV_LEN);
    const salt = randBytes(SALT_LEN);
    const key  = await deriveKey(passphrase, salt);
    const enc  = await crypto.subtle.encrypt(
      { name: ALGO, iv },
      key,
      str2buf(plaintext)
    );
    const blob = concatBuffers(MAGIC.buffer, iv.buffer, salt.buffer, enc);
    return b64enc(blob);
  }

  /**
   * Decrypt a Base64-encoded .vlt payload string.
   * Returns the original UTF-8 string.
   */
  async function decryptText(cipherB64, passphrase) {
    const blob = new Uint8Array(b64dec(cipherB64));
    // Validate magic
    for (let i = 0; i < 4; i++) {
      if (blob[i] !== MAGIC[i]) throw new Error('Invalid .vlt format — bad magic bytes');
    }
    const iv   = blob.slice(4, 4 + IV_LEN);
    const salt = blob.slice(4 + IV_LEN, 4 + IV_LEN + SALT_LEN);
    const data = blob.slice(4 + IV_LEN + SALT_LEN);
    const key  = await deriveKey(passphrase, salt);
    const dec  = await crypto.subtle.decrypt({ name: ALGO, iv }, key, data);
    return buf2str(dec);
  }

  /* ─── File encrypt/decrypt ──────────────────────────────── */

  /**
   * Encrypt an ArrayBuffer (file data) into a .vlt ArrayBuffer.
   */
  async function encryptFile(fileBuffer, passphrase) {
    const iv   = randBytes(IV_LEN);
    const salt = randBytes(SALT_LEN);
    const key  = await deriveKey(passphrase, salt);
    const enc  = await crypto.subtle.encrypt({ name: ALGO, iv }, key, fileBuffer);
    return concatBuffers(MAGIC.buffer, iv.buffer, salt.buffer, enc);
  }

  /**
   * Decrypt a .vlt ArrayBuffer, returning the original file ArrayBuffer.
   */
  async function decryptFile(vltBuffer, passphrase) {
    const blob = new Uint8Array(vltBuffer);
    for (let i = 0; i < 4; i++) {
      if (blob[i] !== MAGIC[i]) throw new Error('Invalid .vlt format — bad magic bytes');
    }
    const iv   = blob.slice(4, 4 + IV_LEN);
    const salt = blob.slice(4 + IV_LEN, 4 + IV_LEN + SALT_LEN);
    const data = blob.slice(4 + IV_LEN + SALT_LEN);
    const key  = await deriveKey(passphrase, salt);
    return crypto.subtle.decrypt({ name: ALGO, iv }, key, data);
  }

  /* ─── VLT Bundle (multi-file) ───────────────────────────── */

  /**
   * Bundle multiple {name, mimeType, buffer} objects into an encrypted .vlt file.
   * Bundle manifest format (JSON) + file data are packed, then encrypted.
   */
  async function encryptBundle(files, passphrase) {
    // Serialize: manifest JSON + raw file bytes, length-prefixed
    const parts = [];
    const manifest = files.map((f, i) => ({
      name: f.name, mimeType: f.mimeType || 'application/octet-stream', index: i, size: f.buffer.byteLength
    }));
    const manifestBuf = str2buf(JSON.stringify(manifest));
    // 4B manifest length
    const mlen = new Uint8Array(4);
    new DataView(mlen.buffer).setUint32(0, manifestBuf.byteLength, false);
    parts.push(BUNDLE_MAGIC.buffer, mlen.buffer, manifestBuf);
    for (const f of files) parts.push(f.buffer);
    const bundleBuffer = concatBuffers(...parts);
    return encryptFile(bundleBuffer, passphrase);
  }

  /**
   * Decrypt a bundle .vlt and return array of {name, mimeType, buffer}.
   */
  async function decryptBundle(vltBuffer, passphrase) {
    const raw   = await decryptFile(vltBuffer, passphrase);
    const view  = new DataView(raw);
    const magic = new Uint8Array(raw, 0, 4);
    for (let i = 0; i < 4; i++) {
      if (magic[i] !== BUNDLE_MAGIC[i]) throw new Error('Not a VLT Bundle file');
    }
    const mlen     = view.getUint32(4, false);
    const mJson    = buf2str(raw.slice(8, 8 + mlen));
    const manifest = JSON.parse(mJson);
    let offset = 8 + mlen;
    return manifest.map(m => {
      const buf = raw.slice(offset, offset + m.size);
      offset += m.size;
      return { name: m.name, mimeType: m.mimeType, buffer: buf };
    });
  }

  /* ─── Steganography ─────────────────────────────────────── */

  /**
   * Hide `payload` inside `coverText` using invisible Unicode characters.
   * The payload is UTF-8 encoded to bytes, then each byte is represented
   * as two 16-ary invisible codepoints (lo/hi nibbles).
   */
  function stegoEncode(payload, coverText = '') {
    const bytes = new TextEncoder().encode(payload);
    let invisible = '';
    for (const byte of bytes) {
      invisible += String.fromCodePoint(STEGO_MAP[byte & 0xF]);
      invisible += String.fromCodePoint(STEGO_MAP[(byte >> 4) & 0xF]);
    }
    return (coverText || '') + STEGO_SEP + invisible;
  }

  /**
   * Extract and decode a steganographic payload from text.
   * Returns the hidden payload string, or null if none found.
   */
  function stegoDecode(text) {
    const sepIdx = text.indexOf(STEGO_SEP);
    if (sepIdx === -1) return null;
    const invisible = text.slice(sepIdx + STEGO_SEP.length);
    const revMap    = new Map(STEGO_MAP.map((cp, i) => [cp, i]));
    const cps       = [...invisible].map(c => c.codePointAt(0));
    const bytes     = [];
    for (let i = 0; i < cps.length - 1; i += 2) {
      const lo = revMap.get(cps[i])   ?? 0;
      const hi = revMap.get(cps[i+1]) ?? 0;
      bytes.push(lo | (hi << 4));
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
  }

  /**
   * Encrypt text then hide it inside coverText using steganography.
   */
  async function stegoEncrypt(plaintext, passphrase, coverText = '') {
    const cipher = await encryptText(plaintext, passphrase);
    return stegoEncode(cipher, coverText);
  }

  /**
   * Extract and decrypt a stego-hidden encrypted payload.
   */
  async function stegoDecrypt(stegoText, passphrase) {
    const cipher = stegoDecode(stegoText);
    if (!cipher) throw new Error('No steganographic payload found in text');
    return decryptText(cipher, passphrase);
  }

  /* ─── Hashing ───────────────────────────────────────────── */

  /**
   * Hash a string with the given algorithm.
   * @param {string} text
   * @param {'SHA-256'|'SHA-384'|'SHA-512'|'SHA-1'} algo
   * @returns {Promise<string>} hex digest
   */
  async function hash(text, algo = 'SHA-256') {
    const buf = await crypto.subtle.digest(algo, str2buf(text));
    return buf2hex(buf);
  }

  /**
   * Hash raw bytes.
   */
  async function hashBytes(buffer, algo = 'SHA-256') {
    const buf = await crypto.subtle.digest(algo, buffer);
    return buf2hex(buf);
  }

  /**
   * HMAC-SHA256 — message authentication code.
   */
  async function hmac(message, secret) {
    const keyMat = await crypto.subtle.importKey(
      'raw', str2buf(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', keyMat, str2buf(message));
    return buf2hex(sig);
  }

  /* ─── Passphrase generation ─────────────────────────────── */

  const CHARSET_CHARS  = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*-_+=';
  const CHARSET_SIMPLE = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const WORD_LIST = [
    'alpha','beta','gamma','delta','sigma','omega','echo','foxtrot','hawk','cipher',
    'proxy','vault','shell','ghost','nexus','storm','blade','frost','neon','pulse',
    'rogue','pixel','forge','nova','apex','venom','hydra','titan','lunar','solar',
    'byte','core','node','zero','flux','dark','code','link','net','grid','mesh',
    'wave','mode','sync','lock','port','data','scan','hack','fire','ice','void'
  ];

  /**
   * Generate a secure passphrase.
   * @param {number} length  — char count (chars mode) or word count (words mode)
   * @param {'chars'|'words'|'pin'} mode
   */
  function generatePassphrase(length = 24, mode = 'chars') {
    if (mode === 'pin') {
      const digits = [];
      const rnd = new Uint8Array(length);
      crypto.getRandomValues(rnd);
      for (const b of rnd) digits.push(b % 10);
      return digits.join('');
    }
    if (mode === 'words') {
      const words = [];
      const rnd = new Uint8Array(length);
      crypto.getRandomValues(rnd);
      for (const b of rnd) words.push(WORD_LIST[b % WORD_LIST.length]);
      return words.join('-');
    }
    // chars mode
    const charset = CHARSET_CHARS;
    const rnd = new Uint8Array(length);
    crypto.getRandomValues(rnd);
    return Array.from(rnd, b => charset[b % charset.length]).join('');
  }

  /* ─── Passphrase strength ───────────────────────────────── */

  /**
   * Score a passphrase 0–100 and return {score, label, color}.
   */
  function scorePassphrase(pass) {
    if (!pass) return { score: 0, label: '—', color: '#3a4860' };
    let s = 0;
    if (pass.length >= 8)  s += 10;
    if (pass.length >= 12) s += 15;
    if (pass.length >= 16) s += 15;
    if (pass.length >= 24) s += 10;
    if (/[a-z]/.test(pass)) s += 10;
    if (/[A-Z]/.test(pass)) s += 10;
    if (/[0-9]/.test(pass)) s += 10;
    if (/[^a-zA-Z0-9]/.test(pass)) s += 15;
    if (/(.)\1{2,}/.test(pass)) s -= 15;
    s = Math.max(0, Math.min(100, s));
    if (s < 30) return { score: s, label: 'WEAK',    color: '#ff2244' };
    if (s < 55) return { score: s, label: 'FAIR',    color: '#ff8844' };
    if (s < 75) return { score: s, label: 'GOOD',    color: '#ffcc00' };
    if (s < 90) return { score: s, label: 'STRONG',  color: '#00ff88' };
    return            { score: s, label: 'FORTRESS', color: '#00aaff' };
  }

  /* ─── Key export/import (.vkey) ─────────────────────────── */

  /**
   * Export a passphrase as a protected .vkey file encrypted with a second passphrase.
   */
  async function exportKey(passphrase, protectPassphrase) {
    return encryptFile(str2buf(passphrase), protectPassphrase);
  }

  /**
   * Import a .vkey file and recover the original passphrase.
   */
  async function importKey(vkeyBuffer, protectPassphrase) {
    const raw = await decryptFile(vkeyBuffer, protectPassphrase);
    return buf2str(raw);
  }

  /* ─── Binary utilities ──────────────────────────────────── */

  /** Convert hex string to Uint8Array */
  const fromHex  = (hex)  => new Uint8Array(hex2buf(hex));
  /** Convert Uint8Array/ArrayBuffer to hex */
  const toHex    = (buf)  => buf2hex(buf);
  /** Convert base64 to Uint8Array */
  const fromB64  = (str)  => new Uint8Array(b64dec(str));
  /** Convert Uint8Array/ArrayBuffer to base64 */
  const toB64    = (buf)  => b64enc(buf instanceof ArrayBuffer ? buf : buf.buffer);
  /** Convert string to hex */
  const strToHex = (str)  => buf2hex(str2buf(str));
  /** Convert hex to string */
  const hexToStr = (hex)  => buf2str(hex2buf(hex));

  /* ─── File download helper ──────────────────────────────── */

  function downloadBuffer(buffer, filename, mimeType = 'application/octet-stream') {
    const blob = new Blob([buffer], { type: mimeType });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function downloadText(text, filename) {
    downloadBuffer(str2buf(text), filename, 'text/plain');
  }

  /* ─── Public API ────────────────────────────────────────── */
  return {
    // Text
    encryptText,
    decryptText,
    // Files
    encryptFile,
    decryptFile,
    // Bundle
    encryptBundle,
    decryptBundle,
    // Stego
    stegoEncode,
    stegoDecode,
    stegoEncrypt,
    stegoDecrypt,
    // Hash
    hash,
    hashBytes,
    hmac,
    // Passphrase
    generatePassphrase,
    scorePassphrase,
    // Key export
    exportKey,
    importKey,
    // Binary utils
    fromHex, toHex, fromB64, toB64, strToHex, hexToStr,
    // Misc
    randBytes,
    buf2hex,
    hex2buf,
    str2buf,
    buf2str,
    b64enc,
    b64dec,
    downloadBuffer,
    downloadText,
    // Constants
    VLT_FORMAT: '.vlt — 4B magic + 12B IV + 32B salt + AES-GCM ciphertext + 16B auth tag',
    STEGO_NOTE: '256 invisible codepoints: tag block U+E0000, variation selectors, zero-width marks',
  };
})();

// Make available globally for HackScript runtime
window.VaultCrypto = VaultCrypto;
