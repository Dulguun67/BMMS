'use strict';
// Нэвтрэлт болон нууц үг сэргээлтэд хамт ашиглах хамгаалалт: буруу оролдлогыг тоолох, 2-р хүчин зүйлийг шалгах.
const db = require('../db');
const totp = require('./totp');
const fc = require('./fieldCrypto');

const mfaAad = (userId) => `hereglegch.mfa:${userId}`;

/** Буруу оролдлогыг тоолж, хязгаарт хүрвэл түгжинэ (нууц үг, MFA код аль алинд) */
async function registerFail(c, cfg, userId) {
  // MySQL UPDATE-ийн SET зүүнээс баруун тийш үнэлэгдэнэ: эхнийх нь нэмэгдсэн утгыг дараагийнх нь ашиглана
  await c.query(`UPDATE hereglegch SET amjiltgui_oroldlogo = amjiltgui_oroldlogo + 1,
                   tugjigdsen_hurtel = IF(amjiltgui_oroldlogo >= ?, NOW() + INTERVAL ? MINUTE, tugjigdsen_hurtel),
                   amjiltgui_oroldlogo = IF(tugjigdsen_hurtel > NOW(), 0, amjiltgui_oroldlogo)
                 WHERE hereglegch_id = ?`, [cfg.LOGIN_MAX_FAILS, cfg.LOGIN_LOCK_MINUTES, userId]);
}

/**
 * TOTP код эсвэл нэг удаагийн нөөц кодыг шалгаж "хэрэглэнэ".
 * u: { hereglegch_id, mfa_secret_enc, mfa_key_id, mfa_suuld_alham }
 * Амжилттай бол 'totp' | 'recovery_code', үгүй бол null.
 */
async function consumeSecondFactor(c, cfg, u, kod) {
  const uid = u.hereglegch_id;
  const secret = Buffer.from(fc.decrypt(u.mfa_secret_enc, u.mfa_key_id, mfaAad(uid)), 'base64');
  const step = totp.verify(secret, kod, u.mfa_suuld_alham);
  if (step !== null) {
    // Зэрэгцээ хүсэлтээр нэг кодыг хоёр удаа ашиглахаас сэргийлнэ
    const [x] = await c.query('UPDATE hereglegch SET mfa_suuld_alham = ? WHERE hereglegch_id = ? AND (mfa_suuld_alham IS NULL OR mfa_suuld_alham < ?)', [step, uid, step]);
    return x.affectedRows === 1 ? 'totp' : null;
  }
  const [x] = await c.query('UPDATE hereglegch_mfa_noots SET ashiglasan_at = NOW() WHERE hereglegch_id = ? AND kod_hash = ? AND ashiglasan_at IS NULL',
    [uid, totp.hashRecovery(kod, cfg.MFA_PEPPER)]);
  return x.affectedRows === 1 ? 'recovery_code' : null;
}

module.exports = { mfaAad, registerFail, consumeSecondFactor, db };
