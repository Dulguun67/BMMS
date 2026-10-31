'use strict';
const db = require('../db');
const tokens = require('../security/tokens');
const { unauthorized, forbidden, HttpError, h } = require('./errors');

let mfaRoles = [];
function init(cfg) { mfaRoles = cfg.MFA_REQUIRED_ROLES; }
const mfaRequired = (role) => mfaRoles.includes(role);

// Хязгаарлагдсан төлөвт (нууц үг солих, MFA тохируулах) зөвхөн эдгээр замыг ашиглана
const ALLOW = {
  password: new Set(['/api/v1/auth/me', '/api/v1/auth/change-password']),
  mfa_setup: new Set(['/api/v1/auth/me', '/api/v1/auth/change-password', '/api/v1/auth/mfa/setup', '/api/v1/auth/mfa/activate']),
};

/**
 * Bearer JWT-г шалгаад хэрэглэгчийг DB-ээс дахин уншина. Ингэснээр түгжигдсэн,
 * идэвхгүй болсон, эрх нь өөрчлөгдсөн хэрэглэгчийн токен тэр даруй хүчингүй болно.
 * Нууц үг солих эсвэл MFA тохируулах шаардлагатай хэрэглэгч зөвхөн тэдгээр замыг ашиглана.
 */
const requireAuth = h(async (req, res, next) => {
  const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
  if (!m) throw unauthorized();
  let claims;
  try { claims = tokens.verifyAccess(m[1]); } catch { throw unauthorized('Токен хүчингүй эсвэл хугацаа дууссан'); }
  const userId = Number(claims.sub);
  const actor = await db.run(null, (c) => db.one(c, `
      SELECT h.hereglegch_id AS id, h.uureg, h.tuluv, h.nevtreh_ner, h.nuuts_ug_solih, h.mfa_idevhtei,
             UNIX_TIMESTAMP(h.token_huchingui_ognoo) AS revokedAt,
             b.bagsh_id AS bagshId, b.tsetserleg_id AS tsetserlegId, b.ovog, b.ner, b.alban_tushaal, b.utas
        FROM hereglegch h LEFT JOIN bagsh b ON b.hereglegch_id = h.hereglegch_id
       WHERE h.hereglegch_id = ?`, [userId]));
  if (!actor || actor.tuluv !== 'idevhtei') throw unauthorized('Хэрэглэгч идэвхгүй байна');
  // Нууц үг солигдсон, эрх өөрчлөгдсөн эсвэл бүх сесс цуцлагдсаны өмнө олгосон токен
  if (actor.revokedAt && claims.iat < Number(actor.revokedAt)) throw unauthorized('Сесс цуцлагдсан. Дахин нэвтэрнэ үү');
  actor.restriction = actor.nuuts_ug_solih ? 'password' : (mfaRequired(actor.uureg) && !actor.mfa_idevhtei ? 'mfa_setup' : null);
  if (actor.restriction && !ALLOW[actor.restriction].has(req.originalUrl.split('?')[0])) {
    throw actor.restriction === 'password'
      ? new HttpError(403, 'Үргэлжлүүлэхийн өмнө нууц үгээ солино уу', 'PASSWORD_CHANGE_REQUIRED')
      : new HttpError(403, 'Үргэлжлүүлэхийн өмнө хоёр шатлалт баталгаажуулалтаа тохируулна уу', 'MFA_SETUP_REQUIRED');
  }
  req.actor = actor;
  if (req.log) req.log = req.log.child({ uid: actor.id });
  next();
});

const requireRole = (...roles) => (req, res, next) =>
  (roles.includes(req.actor.uureg) ? next() : next(forbidden()));

/** Аудитын бүртгэл (хувийн мэдээлэл бичихгүй, зөвхөн танигч) */
async function audit(conn, { userId, uildel, husnegt = null, id = null, ip = null, detail = null }) {
  await conn.query(
    'INSERT INTO audit_log (hereglegch_id, uildel, husnegt, bichlegiin_id, ip, delgerengui) VALUES (?, ?, ?, ?, INET6_ATON(?), ?)',
    [userId ?? null, uildel, husnegt, id == null ? null : String(id), ip ? ip.replace(/^::ffff:/, '') : null,
      detail ? JSON.stringify(detail) : null]);
}

module.exports = { init, requireAuth, requireRole, audit, mfaRequired };
