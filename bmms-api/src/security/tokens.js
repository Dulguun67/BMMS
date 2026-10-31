'use strict';
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

let cfg;
function init(c) { cfg = c; }

/** Богино хугацааны access token (анхдагч 15 мин). Эрх нь DB-ээс хүсэлт бүрд дахин шалгагдана. */
function signAccess(user) {
  return jwt.sign({ role: user.uureg }, cfg.JWT_SECRET, {
    algorithm: 'HS256',
    subject: String(user.hereglegch_id),
    expiresIn: cfg.ACCESS_TOKEN_TTL,
    issuer: cfg.JWT_ISSUER,
    audience: cfg.JWT_AUDIENCE,
  });
}

function verifyAccess(token) {
  return jwt.verify(token, cfg.JWT_SECRET, {
    algorithms: ['HS256'], // "alg: none" болон алгоритм солих халдлагаас хамгаална
    issuer: cfg.JWT_ISSUER,
    audience: cfg.JWT_AUDIENCE,
  });
}

/** Refresh token: 256 бит санамсаргүй. DB-д зөвхөн SHA-256 хэш хадгална. */
function newRefreshToken() { return crypto.randomBytes(32).toString('base64url'); }
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

const COOKIE = 'bmms_rt';
function cookieOptions() {
  return {
    httpOnly: true,
    secure: cfg.COOKIE_SECURE,
    sameSite: 'strict',
    path: '/api/v1/auth',
    maxAge: cfg.REFRESH_TOKEN_DAYS * 24 * 3600 * 1000,
  };
}

// MFA-ийн хоёр дахь алхмын түр токен (5 мин). Access token биш: өөр audience тул API-д ашиглагдахгүй.
function signMfa(userId) {
  return jwt.sign({ purpose: 'mfa' }, cfg.JWT_SECRET, { algorithm: 'HS256', subject: String(userId), expiresIn: '5m',
    issuer: cfg.JWT_ISSUER, audience: `${cfg.JWT_AUDIENCE}-mfa` });
}
function verifyMfa(token) {
  const c = jwt.verify(token, cfg.JWT_SECRET, { algorithms: ['HS256'], issuer: cfg.JWT_ISSUER, audience: `${cfg.JWT_AUDIENCE}-mfa` });
  if (c.purpose !== 'mfa') throw new Error('purpose');
  return Number(c.sub);
}

module.exports = { init, signMfa, verifyMfa, signAccess, verifyAccess, newRefreshToken, sha256, COOKIE, cookieOptions };
