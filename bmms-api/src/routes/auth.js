'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const tokens = require('../security/tokens');
const pw = require('../security/password');
const totp = require('../security/totp');
const fc = require('../security/fieldCrypto');
const { requireAuth, audit, mfaRequired } = require('../middleware/auth');
const { h, unauthorized, badRequest, unprocessable, conflict, forbidden } = require('../middleware/errors');
const { z, parse } = require('../middleware/validate');
const guard = require('../security/accountGuard');
const mailer = require('../mail/mailer');
const templates = require('../mail/templates');

const { mfaAad } = guard;

module.exports = (cfg) => {
  const r = express.Router();

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: cfg.LOGIN_RATE_LIMIT, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: { code: 'RATE_LIMIT', message: 'Хэт олон оролдлого. 15 минутын дараа дахин оролдоно уу' } },
  });

  // Cookie-гаар ажилладаг endpoint-д CSRF-ээс хамгаалах нэмэлт толгой (SameSite=Strict-тэй хамт)
  const csrfHeader = (req, res, next) =>
    (req.get('x-requested-with') === 'bmms' ? next() : next(badRequest('X-Requested-With толгой шаардлагатай')));

  async function issueSession(c, user, req, res) {
    const refresh = tokens.newRefreshToken();
    await c.query(`INSERT INTO hereglegch_session (hereglegch_id, refresh_hash, duusah_hugatsaa, ip, user_agent)
                   VALUES (?, ?, NOW() + INTERVAL ? DAY, INET6_ATON(?), ?)`,
    [user.hereglegch_id, tokens.sha256(refresh), cfg.REFRESH_TOKEN_DAYS, req.ip.replace(/^::ffff:/, ''),
      (req.get('user-agent') || '').slice(0, 255)]);
    res.cookie(tokens.COOKIE, refresh, tokens.cookieOptions());
    return { access_token: tokens.signAccess(user), token_type: 'Bearer', expires_in: cfg.ACCESS_TOKEN_TTL };
  }

  const registerFail = (c, uid) => guard.registerFail(c, cfg, uid);
  async function completeLogin(c, u, req, res, detail) {
    await c.query('UPDATE hereglegch SET amjiltgui_oroldlogo = 0, tugjigdsen_hurtel = NULL, suuld_nevtersen = NOW() WHERE hereglegch_id = ?', [u.hereglegch_id]);
    await audit(c, { userId: u.hereglegch_id, uildel: 'LOGIN', ip: req.ip, detail });
    return issueSession(c, u, req, res);
  }
  const GENERIC = 'Нэвтрэх нэр эсвэл нууц үг буруу, эсвэл бүртгэл түр түгжигдсэн';

  // Нууц үг солигдсоныг эзэнд нь мэдэгдэнэ (хариуны дараа, алдаа гарвал зөвхөн логт)
  function notifyChanged(req, to, ner) {
    const when = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
    mailer.send({ to, ...templates.passwordChanged({ ner, when, ip: req.ip.replace(/^::ffff:/, '') }) })
      .catch((err) => req.log.error({ err }, 'password changed mail failed'));
  }

  // 1-р алхам: нууц үг. MFA идэвхтэй бол сесс үүсгэхгүй, 5 минутын түр токен буцаана.
  r.post('/login', loginLimiter, h(async (req, res) => {
    const body = parse(z.object({ nevtreh_ner: z.string().trim().toLowerCase().max(120), nuuts_ug: z.string().max(200) }), req.body);
    const out = await db.run(null, async (c) => {
      const u = await db.one(c, `SELECT hereglegch_id, nuuts_ug_hash, uureg, tuluv, mfa_idevhtei,
                                        (tugjigdsen_hurtel IS NOT NULL AND tugjigdsen_hurtel > NOW()) AS locked
                                   FROM hereglegch WHERE nevtreh_ner = ?`, [body.nevtreh_ner]);
      const ok = await pw.verifyPassword(body.nuuts_ug, u && u.nuuts_ug_hash ? u.nuuts_ug_hash : await pw.dummyHash());
      if (!u || !ok || u.tuluv !== 'idevhtei' || u.locked) {
        if (u && !ok && !u.locked) await registerFail(c, u.hereglegch_id);
        await audit(c, { userId: u ? u.hereglegch_id : null, uildel: 'LOGIN_FAIL', ip: req.ip,
          detail: { reason: !u ? 'no_user' : u.locked ? 'locked' : u.tuluv !== 'idevhtei' ? 'inactive' : 'bad_password' } });
        return null;
      }
      if (u.mfa_idevhtei) return { mfa_required: true, mfa_token: tokens.signMfa(u.hereglegch_id) };
      return completeLogin(c, u, req, res, null);
    });
    if (!out) throw unauthorized(GENERIC);
    res.json(out);
  }));

  // 2-р алхам: TOTP код эсвэл нэг удаагийн нөөц код
  r.post('/mfa/verify', loginLimiter, h(async (req, res) => {
    const b = parse(z.object({ mfa_token: z.string().max(2000), kod: z.string().trim().max(20) }), req.body);
    let uid;
    try { uid = tokens.verifyMfa(b.mfa_token); } catch { throw unauthorized('Хугацаа дууссан. Дахин нэвтэрнэ үү'); }
    const out = await db.run(null, async (c) => {
      const u = await db.one(c, `SELECT hereglegch_id, uureg, tuluv, mfa_idevhtei, mfa_secret_enc, mfa_key_id, mfa_suuld_alham,
                                        (tugjigdsen_hurtel IS NOT NULL AND tugjigdsen_hurtel > NOW()) AS locked
                                   FROM hereglegch WHERE hereglegch_id = ?`, [uid]);
      if (!u || u.tuluv !== 'idevhtei' || u.locked || !u.mfa_idevhtei) return null;
      const how = await guard.consumeSecondFactor(c, cfg, u, b.kod);
      if (how) return completeLogin(c, u, req, res, { mfa: how });
      await registerFail(c, uid);
      await audit(c, { userId: uid, uildel: 'LOGIN_FAIL', ip: req.ip, detail: { reason: 'bad_mfa_code' } });
      return null;
    });
    if (!out) throw unauthorized('Баталгаажуулах код буруу');
    res.json(out);
  }));

  // Refresh token-ийг ээлжлэн солино. Хүчингүй болсон токен дахин ирвэл хулгайлагдсан гэж үзээд
  // тухайн хэрэглэгчийн бүх сессийг цуцална.
  r.post('/refresh', csrfHeader, h(async (req, res) => {
    const rt = req.cookies[tokens.COOKIE];
    if (!rt) throw unauthorized();
    const out = await db.run(null, async (c) => {
      const s = await db.one(c, `
        SELECT s.session_id, s.hereglegch_id, s.tsutsalsan_at IS NOT NULL AS revoked,
               s.duusah_hugatsaa < NOW() AS expired, h.uureg, h.tuluv
          FROM hereglegch_session s JOIN hereglegch h ON h.hereglegch_id = s.hereglegch_id
         WHERE s.refresh_hash = ?`, [tokens.sha256(rt)]);
      if (!s) return null;
      if (s.revoked) {
        await c.query('UPDATE hereglegch_session SET tsutsalsan_at = NOW() WHERE hereglegch_id = ? AND tsutsalsan_at IS NULL', [s.hereglegch_id]); await c.query('UPDATE hereglegch SET token_huchingui_ognoo = NOW() WHERE hereglegch_id = ?', [s.hereglegch_id]);
        await audit(c, { userId: s.hereglegch_id, uildel: 'LOGOUT', ip: req.ip, detail: { reason: 'refresh_reuse' } });
        return null;
      }
      if (s.expired || s.tuluv !== 'idevhtei') return null;
      const [u] = await c.query('UPDATE hereglegch_session SET tsutsalsan_at = NOW() WHERE session_id = ? AND tsutsalsan_at IS NULL', [s.session_id]);
      if (u.affectedRows !== 1) return null;
      return issueSession(c, s, req, res);
    });
    if (!out) { res.clearCookie(tokens.COOKIE, { path: '/api/v1/auth' }); throw unauthorized('Сесс дууссан. Дахин нэвтэрнэ үү'); }
    res.json(out);
  }));

  r.post('/logout', csrfHeader, h(async (req, res) => {
    const rt = req.cookies[tokens.COOKIE];
    if (rt) {
      await db.run(null, async (c) => {
        const s = await db.one(c, 'SELECT session_id, hereglegch_id FROM hereglegch_session WHERE refresh_hash = ? AND tsutsalsan_at IS NULL', [tokens.sha256(rt)]);
        if (s) {
          await c.query('UPDATE hereglegch_session SET tsutsalsan_at = NOW() WHERE session_id = ?', [s.session_id]);
          await audit(c, { userId: s.hereglegch_id, uildel: 'LOGOUT', ip: req.ip });
        }
      });
    }
    res.clearCookie(tokens.COOKIE, { path: '/api/v1/auth' });
    res.status(204).end();
  }));

  r.get('/me', requireAuth, h(async (req, res) => {
    const a = req.actor;
    const groups = await db.run(a.id, (c) => db.q(c, `
      SELECT b.buleg_id, b.ner, b.turul, b.tuvshin, j.ehleh_on
        FROM buleg b JOIN hicheeliin_jil j ON j.jil_id = b.jil_id
       WHERE (? = 'bagsh' AND (b.bagsh_id = ? OR b.tuslah_bagsh_id = ?))
          OR (? = 'arga_zuich' AND b.tsetserleg_id = ?)
       ORDER BY j.ehleh_on DESC, b.ner`, [a.uureg, a.bagshId, a.bagshId, a.uureg, a.tsetserlegId]));
    res.json({ id: a.id, nevtreh_ner: a.nevtreh_ner, uureg: a.uureg, bagsh_id: a.bagshId, tsetserleg_id: a.tsetserlegId,
      ovog: a.ovog, ner: a.ner, alban_tushaal: a.alban_tushaal, utas: a.utas, buleg: groups,
      nuuts_ug_solih: !!a.nuuts_ug_solih, mfa_idevhtei: !!a.mfa_idevhtei, mfa_shaardlagatai: mfaRequired(a.uureg),
      hyazgaarlalt: a.restriction });
  }));

  // Багш, арга зүйч өөрийн нэр, утсаа засна (PR101). Цэцэрлэг, эрхийг зөвхөн admin өөрчилнө.
  r.patch('/me', requireAuth, h(async (req, res) => {
    const b = parse(z.object({ ovog: z.string().trim().min(1).max(60), ner: z.string().trim().min(1).max(60),
      utas: z.string().regex(/^\d{8}$/, '8 оронтой утас').nullable() }).partial(), req.body);
    if (!req.actor.bagshId) throw unprocessable('Профайлгүй хэрэглэгч');
    const fields = Object.keys(b);
    if (!fields.length) throw unprocessable('Өөрчлөх талбар алга');
    await db.run(req.actor.id, (c) => c.query(`UPDATE bagsh SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE bagsh_id = ?`,
      [...fields.map((f) => b[f] ?? null), req.actor.bagshId]));
    res.status(204).end();
  }));

  r.post('/change-password', requireAuth, h(async (req, res) => {
    const b = parse(z.object({ huuchin: z.string().max(200), shine: z.string().max(200) }), req.body);
    const problems = pw.checkPolicy(b.shine, cfg.PASSWORD_MIN_LENGTH);
    if (problems.length) throw unprocessable('Нууц үгийн шаардлага хангахгүй', problems);
    await db.run(req.actor.id, async (c) => {
      const u = await db.one(c, 'SELECT nuuts_ug_hash FROM hereglegch WHERE hereglegch_id = ?', [req.actor.id]);
      if (!(await pw.verifyPassword(b.huuchin, u.nuuts_ug_hash))) throw unauthorized('Одоогийн нууц үг буруу');
      if (await pw.verifyPassword(b.shine, u.nuuts_ug_hash)) throw unprocessable('Шинэ нууц үг хуучнаасаа ялгаатай байна');
      await c.query('UPDATE hereglegch SET nuuts_ug_hash = ?, nuuts_ug_solih = FALSE WHERE hereglegch_id = ?', [await pw.hashPassword(b.shine), req.actor.id]);
      // Бүх сессийг цуцална (энэ төхөөрөмж дээр ч дахин нэвтэрнэ)
      await c.query('UPDATE hereglegch_session SET tsutsalsan_at = NOW() WHERE hereglegch_id = ? AND tsutsalsan_at IS NULL', [req.actor.id]); await c.query('UPDATE hereglegch SET token_huchingui_ognoo = NOW() WHERE hereglegch_id = ?', [req.actor.id]);
      await audit(c, { userId: req.actor.id, uildel: 'UPDATE', husnegt: 'hereglegch', id: req.actor.id, ip: req.ip, detail: { action: 'password_change' } });
    });
    res.clearCookie(tokens.COOKIE, { path: '/api/v1/auth' });
    res.status(204).end();
    notifyChanged(req, req.actor.nevtreh_ner, req.actor.ner);
  }));

  // ---------------- MFA тохируулах ----------------
  async function loadMfa(c, uid) {
    return db.one(c, 'SELECT nevtreh_ner, mfa_idevhtei, mfa_secret_enc, mfa_key_id, mfa_suuld_alham FROM hereglegch WHERE hereglegch_id = ?', [uid]);
  }
  const secretOf = (u, uid) => Buffer.from(fc.decrypt(u.mfa_secret_enc, u.mfa_key_id, mfaAad(uid)), 'base64');
  async function newCodes(c, uid) {
    const codes = totp.newRecoveryCodes();
    await c.query('DELETE FROM hereglegch_mfa_noots WHERE hereglegch_id = ?', [uid]);
    for (const k of codes) await c.query('INSERT INTO hereglegch_mfa_noots (hereglegch_id, kod_hash) VALUES (?, ?)', [uid, totp.hashRecovery(k, cfg.MFA_PEPPER)]);
    return codes;
  }
  async function requireCode(c, uid, u, kod) {
    const step = totp.verify(secretOf(u, uid), kod, u.mfa_suuld_alham);
    if (step === null) throw unauthorized('Баталгаажуулах код буруу');
    await c.query('UPDATE hereglegch SET mfa_suuld_alham = ? WHERE hereglegch_id = ?', [step, uid]);
  }

  // Шинэ нууц түлхүүр үүсгэнэ (идэвхжүүлэх хүртэл хүчингүй). Authenticator апп-д QR эсвэл түлхүүрээр нэмнэ.
  r.post('/mfa/setup', requireAuth, h(async (req, res) => {
    const uid = req.actor.id;
    const out = await db.run(uid, async (c) => {
      const u = await loadMfa(c, uid);
      if (u.mfa_idevhtei) throw conflict('Хоёр шатлалт баталгаажуулалт аль хэдийн идэвхтэй байна');
      const secret = totp.newSecret();
      await c.query('UPDATE hereglegch SET mfa_secret_enc = ?, mfa_key_id = ?, mfa_suuld_alham = NULL WHERE hereglegch_id = ?',
        [fc.encrypt(secret.toString('base64'), mfaAad(uid)), fc.activeKeyId(), uid]);
      return { tulhuur: totp.base32Encode(secret), otpauth_uri: totp.otpauthUri({ secret, account: u.nevtreh_ner, issuer: cfg.MFA_ISSUER }) };
    });
    res.json(out);
  }));

  // Апп-ын үүсгэсэн кодоор баталгаажуулж идэвхжүүлнэ. Нөөц кодыг зөвхөн энэ удаа харуулна.
  r.post('/mfa/activate', requireAuth, h(async (req, res) => {
    const b = parse(z.object({ kod: z.string().trim().regex(/^\d{6}$/, '6 оронтой код') }), req.body);
    const uid = req.actor.id;
    const out = await db.tx(uid, async (c) => {
      const u = await loadMfa(c, uid);
      if (u.mfa_idevhtei) throw conflict('Аль хэдийн идэвхтэй байна');
      if (!u.mfa_secret_enc) throw unprocessable('Эхлээд тохиргоог эхлүүлнэ үү');
      await requireCode(c, uid, u, b.kod);
      await c.query('UPDATE hereglegch SET mfa_idevhtei = TRUE WHERE hereglegch_id = ?', [uid]);
      const codes = await newCodes(c, uid);
      await audit(c, { userId: uid, uildel: 'UPDATE', husnegt: 'hereglegch', id: uid, ip: req.ip, detail: { action: 'mfa_enabled' } });
      return { noots_kod: codes };
    });
    res.json(out);
  }));

  r.post('/mfa/recovery-codes', requireAuth, h(async (req, res) => {
    const b = parse(z.object({ kod: z.string().trim().regex(/^\d{6}$/, '6 оронтой код') }), req.body);
    const uid = req.actor.id;
    const out = await db.tx(uid, async (c) => {
      const u = await loadMfa(c, uid);
      if (!u.mfa_idevhtei) throw unprocessable('Хоёр шатлалт баталгаажуулалт идэвхгүй байна');
      await requireCode(c, uid, u, b.kod);
      const codes = await newCodes(c, uid);
      await audit(c, { userId: uid, uildel: 'UPDATE', husnegt: 'hereglegch', id: uid, ip: req.ip, detail: { action: 'mfa_recovery_regenerated' } });
      return { noots_kod: codes };
    });
    res.json(out);
  }));

  r.post('/mfa/disable', requireAuth, h(async (req, res) => {
    const b = parse(z.object({ kod: z.string().trim().regex(/^\d{6}$/, '6 оронтой код') }), req.body);
    const uid = req.actor.id;
    if (mfaRequired(req.actor.uureg)) throw forbidden('Таны үүрэгт хоёр шатлалт баталгаажуулалт заавал');
    await db.tx(uid, async (c) => {
      const u = await loadMfa(c, uid);
      if (!u.mfa_idevhtei) throw unprocessable('Идэвхгүй байна');
      await requireCode(c, uid, u, b.kod);
      await c.query('UPDATE hereglegch SET mfa_idevhtei = FALSE, mfa_secret_enc = NULL, mfa_key_id = NULL, mfa_suuld_alham = NULL WHERE hereglegch_id = ?', [uid]);
      await c.query('DELETE FROM hereglegch_mfa_noots WHERE hereglegch_id = ?', [uid]);
      await audit(c, { userId: uid, uildel: 'UPDATE', husnegt: 'hereglegch', id: uid, ip: req.ip, detail: { action: 'mfa_disabled' } });
    });
    res.status(204).end();
  }));

  return r;
};
