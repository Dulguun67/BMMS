'use strict';
// TOTP (RFC 6238, HMAC-SHA1, 30 секунд, 6 орон) — Google Authenticator, Microsoft Authenticator зэрэгтэй нийцтэй.
const crypto = require('crypto');

const ALPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP = 30;
const DIGITS = 6;

function base32Encode(buf) {
  let bits = 0; let value = 0; let out = '';
  for (const b of buf) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += ALPH[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPH[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(s) {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0; let value = 0; const out = [];
  for (const ch of clean) {
    value = (value << 5) | ALPH.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

function hotp(secret, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', secret).update(msg).digest();
  const off = h[h.length - 1] & 0x0f;
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 10 ** DIGITS).padStart(DIGITS, '0');
}

const stepAt = (ms = Date.now()) => Math.floor(ms / 1000 / STEP);
const newSecret = () => crypto.randomBytes(20); // 160 бит (RFC 4226-ийн зөвлөмж)

/**
 * Кодыг шалгана. Цагийн зөрүүнд ±1 алхам (±30 сек) зөвшөөрнө.
 * lastStep-ээс хойшхи алхам л хүчинтэй: нэг кодыг хоёр удаа ашиглахгүй.
 * Амжилттай бол ашигласан алхмыг, үгүй бол null буцаана.
 */
function verify(secret, code, lastStep = null, now = Date.now()) {
  if (!/^\d{6}$/.test(String(code || ''))) return null;
  const cur = stepAt(now);
  for (const s of [cur - 1, cur, cur + 1]) {
    if (lastStep != null && s <= lastStep) continue;
    const exp = Buffer.from(hotp(secret, s));
    if (crypto.timingSafeEqual(exp, Buffer.from(String(code)))) return s;
  }
  return null;
}

function otpauthUri({ secret, account, issuer }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${base32Encode(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP}`;
}

// Нөөц код: 10 ширхэг, XXXXX-XXXXX (50 бит). DB-д серверийн түлхүүртэй HMAC-SHA256 хадгална.
const CODE_ALPH = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // андуурагдах 0/O, 1/I-гүй
function newRecoveryCodes(n = 10) {
  return Array.from({ length: n }, () => {
    const b = crypto.randomBytes(10);
    const s = [...b].map((x) => CODE_ALPH[x & 31]).join('');
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}
const normalizeCode = (c) => String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
function hashRecovery(code, key) {
  return crypto.createHmac('sha256', key).update(normalizeCode(code)).digest('hex');
}

module.exports = { base32Encode, base32Decode, hotp, verify, stepAt, newSecret, otpauthUri, newRecoveryCodes, hashRecovery, normalizeCode };
