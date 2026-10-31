'use strict';
// Нууц үгийн хэш: Node.js-ийн суурь scrypt (OWASP-ын зөвлөмжийн параметр, нэмэлт native сан шаардахгүй).
// Хадгалах хэлбэр: scrypt$N$r$p$<salt b64>$<hash b64>
const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
// OWASP Password Storage Cheat Sheet: N=2^15, r=8, p=3 (~32 MiB санах ой, нэгэн зэрэг олон нэвтрэлтэд тэсвэртэй)
const N = 2 ** 15; const R = 8; const P = 3; const KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

async function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(plain.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function verifyPassword(plain, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(plain.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length,
    { N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// Хэрэглэгч олдоогүй үед ч ижил хугацаа зарцуулж, бүртгэлтэй эсэхийг хугацаагаар таахаас сэргийлнэ.
let dummy;
async function dummyHash() { if (!dummy) dummy = await hashPassword(crypto.randomBytes(16).toString('hex')); return dummy; }

function checkPolicy(plain, minLen) {
  const problems = [];
  if (plain.length < minLen) problems.push(`Хамгийн багадаа ${minLen} тэмдэгт`);
  if (plain.length > 200) problems.push('200 тэмдэгтээс ихгүй');
  const classes = [/[a-zа-яөүё]/, /[A-ZА-ЯӨҮЁ]/, /\d/, /[^\p{L}\d]/u].filter((rx) => rx.test(plain)).length;
  if (classes < 3) problems.push('Жижиг, том үсэг, тоо, тэмдэгтээс 3-ыг агуулна');
  return problems;
}

module.exports = { hashPassword, verifyPassword, dummyHash, checkPolicy };
