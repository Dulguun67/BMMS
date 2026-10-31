'use strict';
// Нууц үгээ мартсан үед имэйлээр сэргээх (OWASP Forgot Password Cheat Sheet-ийн дагуу):
//  - Бүртгэлтэй эсэхээс үл хамааран ижил хариу; имэйлийг хариуны дараа илгээнэ (хугацаагаар таахаас сэргийлнэ)
//  - 256 бит санамсаргүй токен, DB-д зөвхөн SHA-256 хэш; 30 минут; нэг удаа; шинэ хүсэлт хуучныг хүчингүй болгоно
//  - Холбоос: /nuuts-ug-sergeeh#token=... — fragment тул сервер, CloudFront, Referer-д дамжихгүй
//  - MFA идэвхтэй хэрэглэгчээс 2-р хүчин зүйлийг шаардана: имэйл алдагдсан ч бүртгэлийг булаахгүй
//  - Амжилттай бол бүх сесс, бусад токен хүчингүй болж, эзэнд нь мэдэгдэл очно
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const tokens = require('../security/tokens');
const pw = require('../security/password');
const guard = require('../security/accountGuard');
const mailer = require('../mail/mailer');
const templates = require('../mail/templates');
const { audit } = require('../middleware/auth');
const { h, HttpError, unprocessable, unauthorized } = require('../middleware/errors');
const { z, parse } = require('../middleware/validate');

const INVALID = () => new HttpError(400, 'Холбоос хүчингүй эсвэл хугацаа нь дууссан. Шинээр хүсэлт илгээнэ үү', 'INVALID_TOKEN');
const cleanIp = (ip) => (ip ? ip.replace(/^::ffff:/, '') : null);

let cfg;
function init(c) { cfg = c; }

/**
 * Токен үүсгэж, холбоос илгээнэ. Хэрэглэгч олдохгүй, идэвхгүй, эсвэл цагт хэт олон хүсэлт гаргасан бол
 * юу ч илгээхгүй (дуудагчид ялгааг мэдэгдэхгүй). byAdmin үед цагийн хязгаар үйлчлэхгүй.
 */
async function createAndSend({ email, userId, ip, byAdmin = false, actorId = null }) {
  const out = await db.run(actorId, async (c) => {
    const u = await db.one(c, `SELECT h.hereglegch_id, h.nevtreh_ner, h.tuluv, b.ner FROM hereglegch h
                                 LEFT JOIN bagsh b ON b.hereglegch_id = h.hereglegch_id
                                WHERE ${userId ? 'h.hereglegch_id = ?' : 'h.nevtreh_ner = ?'}`, [userId || email]);
    if (!u || u.tuluv !== 'idevhtei') return null;
    const uid = u.hereglegch_id;
    const recent = await db.one(c, 'SELECT COUNT(*) AS n FROM nuuts_ug_sergeelt WHERE hereglegch_id = ? AND created_at > NOW() - INTERVAL 1 HOUR', [uid]);
    if (!byAdmin && recent.n >= cfg.PASSWORD_RESET_PER_HOUR) {
      await audit(c, { userId: uid, uildel: 'UPDATE', husnegt: 'hereglegch', id: uid, ip, detail: { action: 'password_reset_throttled' } });
      return null;
    }
    // Өмнөх ашиглагдаагүй холбоосуудыг хүчингүй болгож, хуучин бичлэгийг цэвэрлэнэ
    await c.query('UPDATE nuuts_ug_sergeelt SET ashiglasan_at = NOW() WHERE hereglegch_id = ? AND ashiglasan_at IS NULL', [uid]);
    await c.query('DELETE FROM nuuts_ug_sergeelt WHERE hereglegch_id = ? AND created_at < NOW() - INTERVAL 30 DAY', [uid]);
    const token = tokens.newRefreshToken();
    await c.query(`INSERT INTO nuuts_ug_sergeelt (hereglegch_id, token_hash, duusah_hugatsaa, huseltiin_ip, ehelsen)
                   VALUES (?, ?, NOW() + INTERVAL ? MINUTE, INET6_ATON(?), ?)`,
    [uid, tokens.sha256(token), cfg.PASSWORD_RESET_TTL_MIN, cleanIp(ip), byAdmin ? 'admin' : 'hereglegch']);
    await audit(c, { userId: actorId || uid, uildel: 'UPDATE', husnegt: 'hereglegch', id: uid, ip, detail: { action: 'password_reset_requested', by: byAdmin ? 'admin' : 'user' } });
    return { to: u.nevtreh_ner, ner: u.ner, token };
  });
  if (!out) return false;
  const link = `${cfg.APP_URL.replace(/\/$/, '')}/nuuts-ug-sergeeh#token=${out.token}`;
  await mailer.send({ to: out.to, ...templates.resetLink({ ner: out.ner, link, minutes: cfg.PASSWORD_RESET_TTL_MIN, byAdmin }) });
  return true;
}

async function findToken(c, token) {
  if (typeof token !== 'string' || !/^[\w-]{20,100}$/.test(token)) return null;
  return db.one(c, `
    SELECT s.sergeelt_id, h.hereglegch_id, h.tuluv, h.nevtreh_ner, h.nuuts_ug_hash, h.mfa_idevhtei, h.mfa_secret_enc, h.mfa_key_id,
           h.mfa_suuld_alham, b.ner, (h.tugjigdsen_hurtel IS NOT NULL AND h.tugjigdsen_hurtel > NOW()) AS locked
      FROM nuuts_ug_sergeelt s JOIN hereglegch h ON h.hereglegch_id = s.hereglegch_id
      LEFT JOIN bagsh b ON b.hereglegch_id = h.hereglegch_id
     WHERE s.token_hash = ? AND s.ashiglasan_at IS NULL AND s.duusah_hugatsaa > NOW()`, [tokens.sha256(token)]);
}

function router() {
  const r = express.Router();
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: cfg.LOGIN_RATE_LIMIT, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: { code: 'RATE_LIMIT', message: 'Хэт олон оролдлого. 15 минутын дараа дахин оролдоно уу' } },
  });

  r.post('/password/forgot', limiter, h(async (req, res) => {
    const b = parse(z.object({ nevtreh_ner: z.string().trim().toLowerCase().max(120) }), req.body);
    res.status(202).json({ ok: true });
    // Хариуны дараа: бүртгэлтэй/бүртгэлгүй хоёрын хариуны хугацаа ижил байна
    createAndSend({ email: b.nevtreh_ner, ip: req.ip })
      .catch((err) => req.log.error({ err }, 'password reset request failed'));
  }));

  // Холбоос хүчинтэй эсэх, MFA код шаардах эсэх (сэргээх хуудсыг зөв харуулахад)
  r.post('/password/reset/check', limiter, h(async (req, res) => {
    const b = parse(z.object({ token: z.string().max(200) }), req.body);
    const t = await db.run(null, (c) => findToken(c, b.token));
    if (!t || t.tuluv !== 'idevhtei') throw INVALID();
    res.json({ valid: true, mfa_required: !!t.mfa_idevhtei });
  }));

  r.post('/password/reset', limiter, h(async (req, res) => {
    const b = parse(z.object({ token: z.string().max(200), shine: z.string().max(200), kod: z.string().trim().max(20).optional() }), req.body);
    const problems = pw.checkPolicy(b.shine, cfg.PASSWORD_MIN_LENGTH);
    if (problems.length) throw unprocessable('Нууц үгийн шаардлага хангахгүй', problems);
    const hash = await pw.hashPassword(b.shine);
    const user = await db.tx(null, async (c) => {
      const t = await findToken(c, b.token);
      if (!t || t.tuluv !== 'idevhtei') throw INVALID();
      const uid = t.hereglegch_id;
      let how = 'email';
      if (t.mfa_idevhtei) {
        if (t.locked) throw unauthorized('Бүртгэл түр түгжигдсэн. Хэсэг хугацааны дараа дахин оролдоно уу');
        if (!b.kod) throw new HttpError(401, 'Authenticator апп-ын код эсвэл нөөц код шаардлагатай', 'MFA_REQUIRED');
        how = await guard.consumeSecondFactor(c, cfg, t, b.kod);
        if (!how) {
          // Түгжээ, аудитыг rollback-аас хамгаалахын тулд тусдаа холболтоор бичнэ
          await db.run(null, async (c2) => {
            await guard.registerFail(c2, cfg, uid);
            await audit(c2, { userId: uid, uildel: 'LOGIN_FAIL', ip: req.ip, detail: { reason: 'bad_mfa_code', flow: 'password_reset' } });
          });
          throw unauthorized('Баталгаажуулах код буруу');
        }
      }
      if (await pw.verifyPassword(b.shine, t.nuuts_ug_hash)) throw unprocessable('Шинэ нууц үг хуучнаасаа ялгаатай байна');
      const [x] = await c.query('UPDATE nuuts_ug_sergeelt SET ashiglasan_at = NOW() WHERE sergeelt_id = ? AND ashiglasan_at IS NULL', [t.sergeelt_id]);
      if (x.affectedRows !== 1) throw INVALID();
      await c.query(`UPDATE hereglegch SET nuuts_ug_hash = ?, nuuts_ug_solih = FALSE, amjiltgui_oroldlogo = 0, tugjigdsen_hurtel = NULL
                     WHERE hereglegch_id = ?`, [hash, uid]);
      await c.query('UPDATE nuuts_ug_sergeelt SET ashiglasan_at = NOW() WHERE hereglegch_id = ? AND ashiglasan_at IS NULL', [uid]);
      await c.query('UPDATE hereglegch_session SET tsutsalsan_at = NOW() WHERE hereglegch_id = ? AND tsutsalsan_at IS NULL', [uid]); await c.query('UPDATE hereglegch SET token_huchingui_ognoo = NOW() WHERE hereglegch_id = ?', [uid]);
      await audit(c, { userId: uid, uildel: 'UPDATE', husnegt: 'hereglegch', id: uid, ip: req.ip, detail: { action: 'password_reset', second_factor: how } });
      return { to: t.nevtreh_ner, ner: t.ner };
    });
    res.status(204).end();
    const when = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
    mailer.send({ to: user.to, ...templates.passwordChanged({ ner: user.ner, when, ip: cleanIp(req.ip) }) })
      .catch((err) => req.log.error({ err }, 'password changed mail failed'));
  }));
  return r;
}

module.exports = { init, router, createAndSend };
