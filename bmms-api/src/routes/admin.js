'use strict';
const express = require('express');
const db = require('../db');
const pw = require('../security/password');
const { requireRole, audit } = require('../middleware/auth');
const { groupFor } = require('../middleware/access');
const { h, notFound, forbidden, unprocessable } = require('../middleware/errors');
const { z, parse, id, date, text, reqText, phone, idParam, ENUM } = require('../middleware/validate');

module.exports = (cfg) => {
  const r = express.Router();
  const admin = requireRole('admin');
  const staff = requireRole('admin', 'arga_zuich');

  // ---------------- Хэрэглэгч (зөвхөн admin) ----------------
  r.get('/admin/users', admin, h(async (req, res) => {
    res.json(await db.run(req.actor.id, (c) => db.q(c, `
      SELECT h.hereglegch_id, h.nevtreh_ner, h.uureg, h.tuluv, h.suuld_nevtersen, h.mfa_idevhtei, h.nuuts_ug_solih,
             b.bagsh_id, b.tsetserleg_id, b.ovog, b.ner, b.alban_tushaal
        FROM hereglegch h LEFT JOIN bagsh b ON b.hereglegch_id = h.hereglegch_id ORDER BY h.hereglegch_id`)));
  }));

  const NewUser = z.object({
    nevtreh_ner: z.string().trim().toLowerCase().max(120).pipe(z.email({ message: "Имэйл хаяг буруу" })),
    nuuts_ug: z.string().max(200),
    uureg: z.enum(ENUM.uureg),
    profile: z.object({
      tsetserleg_id: id, ovog: reqText(60), ner: reqText(60),
      alban_tushaal: z.enum(ENUM.alban), utas: phone.optional(),
    }).optional(),
  }).refine((v) => v.uureg === 'admin' || v.profile, { message: 'Багш, арга зүйчид profile заавал', path: ['profile'] });

  r.post('/admin/users', admin, h(async (req, res) => {
    const b = parse(NewUser, req.body);
    const problems = pw.checkPolicy(b.nuuts_ug, cfg.PASSWORD_MIN_LENGTH);
    if (problems.length) throw unprocessable('Нууц үгийн шаардлага хангахгүй', problems);
    const hash = await pw.hashPassword(b.nuuts_ug);
    const out = await db.tx(req.actor.id, async (c) => {
      // Admin-ий өгсөн түр нууц үгийг анх нэвтрэхэд солиулна
      const [u] = await c.query('INSERT INTO hereglegch (nevtreh_ner, nuuts_ug_hash, nuuts_ug_solih, uureg) VALUES (?, ?, TRUE, ?)', [b.nevtreh_ner, hash, b.uureg]);
      let bagshId = null;
      if (b.profile) {
        const p = b.profile;
        const [x] = await c.query('INSERT INTO bagsh (hereglegch_id, tsetserleg_id, ovog, ner, alban_tushaal, utas) VALUES (?, ?, ?, ?, ?, ?)',
          [u.insertId, p.tsetserleg_id, p.ovog, p.ner, p.alban_tushaal, p.utas ?? null]);
        bagshId = x.insertId;
      }
      await audit(c, { userId: req.actor.id, uildel: 'INSERT', husnegt: 'hereglegch', id: u.insertId, ip: req.ip });
      return { hereglegch_id: u.insertId, bagsh_id: bagshId };
    });
    res.status(201).json(out);
  }));

  r.patch('/admin/users/:id', admin, h(async (req, res) => {
    const { id: uid } = parse(idParam, req.params);
    const b = parse(z.object({ tuluv: z.enum(['idevhtei', 'tugjigdsen', 'idevhgui']).optional(),
      uureg: z.enum(ENUM.uureg).optional(), nuuts_ug: z.string().max(200).optional(), mfa_reset: z.literal(true).optional() }), req.body);
    if (uid === req.actor.id && (b.tuluv || b.uureg)) throw forbidden('Өөрийн эрх, төлвийг өөрчлөхгүй');
    if (b.nuuts_ug) {
      const problems = pw.checkPolicy(b.nuuts_ug, cfg.PASSWORD_MIN_LENGTH);
      if (problems.length) throw unprocessable('Нууц үгийн шаардлага хангахгүй', problems);
    }
    const hash = b.nuuts_ug ? await pw.hashPassword(b.nuuts_ug) : null;
    await db.tx(req.actor.id, async (c) => {
      const [u] = await c.query(`UPDATE hereglegch SET tuluv = COALESCE(?, tuluv), uureg = COALESCE(?, uureg),
                                   nuuts_ug_hash = COALESCE(?, nuuts_ug_hash), amjiltgui_oroldlogo = IF(? IS NULL, amjiltgui_oroldlogo, 0),
                                   tugjigdsen_hurtel = IF(? IS NULL, tugjigdsen_hurtel, NULL),
                                   nuuts_ug_solih = IF(? IS NULL, nuuts_ug_solih, TRUE),
                                   mfa_idevhtei = IF(?, FALSE, mfa_idevhtei), mfa_secret_enc = IF(?, NULL, mfa_secret_enc),
                                   mfa_key_id = IF(?, NULL, mfa_key_id), mfa_suuld_alham = IF(?, NULL, mfa_suuld_alham)
                                 WHERE hereglegch_id = ?`, [b.tuluv ?? null, b.uureg ?? null, hash, hash, hash, hash,
        !!b.mfa_reset, !!b.mfa_reset, !!b.mfa_reset, !!b.mfa_reset, uid]);
      // Утас алдсан хэрэглэгчийн MFA-г тэглэхэд нөөц кодууд хамт устна; дараагийн нэвтрэлтэд дахин тохируулна
      if (b.mfa_reset) await c.query('DELETE FROM hereglegch_mfa_noots WHERE hereglegch_id = ?', [uid]);
      if (!u.affectedRows) throw notFound('Хэрэглэгч олдсонгүй');
      // Эрх, төлөв, нууц үг өөрчлөгдвөл бүх сессийг цуцална
      await c.query('UPDATE hereglegch_session SET tsutsalsan_at = NOW() WHERE hereglegch_id = ? AND tsutsalsan_at IS NULL', [uid]); await c.query('UPDATE hereglegch SET token_huchingui_ognoo = NOW() WHERE hereglegch_id = ?', [uid]);
      await audit(c, { userId: req.actor.id, uildel: 'UPDATE', husnegt: 'hereglegch', id: uid, ip: req.ip,
        detail: { fields: Object.keys(b).filter((k) => k !== 'nuuts_ug').concat(b.nuuts_ug ? ['password_reset'] : []) } });
    });
    res.status(204).end();
  }));

  // Бүлэг үүсгэхэд багш сонгох жагсаалт (admin: бүгд, арга зүйч: өөрийн цэцэрлэг)
  r.get('/teachers', staff, h(async (req, res) => {
    const { tsetserleg_id: tsId } = parse(z.object({ tsetserleg_id: id.optional() }), req.query);
    const scope = req.actor.uureg === 'arga_zuich' ? req.actor.tsetserlegId : (tsId ?? null);
    res.json(await db.run(req.actor.id, (c) => db.q(c, `
      SELECT b.bagsh_id, b.tsetserleg_id, b.ovog, b.ner, b.alban_tushaal
        FROM bagsh b JOIN hereglegch h ON h.hereglegch_id = b.hereglegch_id
       WHERE h.tuluv = 'idevhtei' AND (? IS NULL OR b.tsetserleg_id = ?) ORDER BY b.ner`, [scope, scope])));
  }));

  // Admin нууц үг мэдэлгүйгээр хэрэглэгчид тохируулах холбоос илгээнэ (түр нууц үгийн оронд)
  r.post('/admin/users/:id/send-reset', admin, h(async (req, res) => {
    const { id: uid } = parse(idParam, req.params);
    const sent = await require('./passwordReset').createAndSend({ userId: uid, ip: req.ip, byAdmin: true, actorId: req.actor.id });
    if (!sent) throw notFound('Идэвхтэй хэрэглэгч олдсонгүй');
    res.status(202).json({ ok: true });
  }));

  // ---------------- Цэцэрлэг, хичээлийн жил ----------------
  r.get('/kindergartens', h(async (req, res) => {
    res.json(await db.run(req.actor.id, (c) => db.q(c, 'SELECT tsetserleg_id, ner, duureg, horoo, bairshil, utas FROM tsetserleg ORDER BY ner')));
  }));
  r.post('/kindergartens', admin, h(async (req, res) => {
    const b = parse(z.object({ ner: reqText(150), duureg: z.enum(ENUM.duureg).optional(), horoo: z.number().int().min(1).max(45).optional(),
      bairshil: text(255).optional(), utas: text(20).optional(), esis_kod: text(40).optional() }), req.body);
    const [x] = await db.run(req.actor.id, (c) => c.query('INSERT INTO tsetserleg (ner, duureg, horoo, bairshil, utas, esis_kod) VALUES (?, ?, ?, ?, ?, ?)',
      [b.ner, b.duureg ?? null, b.horoo ?? null, b.bairshil ?? null, b.utas ?? null, b.esis_kod ?? null]));
    res.status(201).json({ tsetserleg_id: x.insertId });
  }));

  r.get('/school-years', h(async (req, res) => {
    res.json(await db.run(req.actor.id, (c) => db.q(c, 'SELECT * FROM hicheeliin_jil ORDER BY ehleh_on DESC')));
  }));
  r.post('/school-years', admin, h(async (req, res) => {
    const b = parse(z.object({ ehleh_on: z.number().int().min(2020).max(2100), ehleh_ognoo: date, duusah_ognoo: date }), req.body);
    const [x] = await db.run(req.actor.id, (c) => c.query('INSERT INTO hicheeliin_jil (ehleh_on, ehleh_ognoo, duusah_ognoo) VALUES (?, ?, ?)',
      [b.ehleh_on, b.ehleh_ognoo, b.duusah_ognoo]));
    res.status(201).json({ jil_id: x.insertId });
  }));
  r.get('/school-years/:id/periods', h(async (req, res) => {
    const { id: jid } = parse(idParam, req.params);
    res.json(await db.run(req.actor.id, (c) => db.q(c, 'SELECT * FROM unelgee_uye WHERE jil_id = ? ORDER BY turul + 0', [jid])));
  }));
  r.post('/school-years/:id/periods', staff, h(async (req, res) => {
    const { id: jid } = parse(idParam, req.params);
    const b = parse(z.object({ turul: z.enum(ENUM.uyeTurul), ehleh_ognoo: date, duusah_ognoo: date }), req.body);
    const [x] = await db.run(req.actor.id, (c) => c.query('INSERT INTO unelgee_uye (jil_id, turul, ehleh_ognoo, duusah_ognoo) VALUES (?, ?, ?, ?)',
      [jid, b.turul, b.ehleh_ognoo, b.duusah_ognoo]));
    res.status(201).json({ uye_id: x.insertId });
  }));

  // ---------------- Бүлэг үүсгэх, засах (admin / арга зүйч) ----------------
  const GroupBody = z.object({ tsetserleg_id: id, jil_id: id, ner: reqText(80), turul: z.enum(ENUM.bulegTurul),
    bagsh_id: id, tuslah_bagsh_id: id.nullable().optional() });
  async function checkTeachers(c, tsId, ids) {
    const list = ids.filter(Boolean);
    if (!list.length) return;
    const rows = await db.q(c, 'SELECT bagsh_id FROM bagsh WHERE tsetserleg_id = ? AND bagsh_id IN (?)', [tsId, list]);
    if (rows.length !== new Set(list).size) throw unprocessable('Багш тухайн цэцэрлэгт харьяалагдахгүй байна');
  }
  r.post('/groups', staff, h(async (req, res) => {
    const b = parse(GroupBody, req.body);
    if (req.actor.uureg === 'arga_zuich' && b.tsetserleg_id !== req.actor.tsetserlegId) throw forbidden();
    const out = await db.run(req.actor.id, async (c) => {
      await checkTeachers(c, b.tsetserleg_id, [b.bagsh_id, b.tuslah_bagsh_id]);
      const [x] = await c.query('INSERT INTO buleg (tsetserleg_id, jil_id, ner, turul, bagsh_id, tuslah_bagsh_id) VALUES (?, ?, ?, ?, ?, ?)',
        [b.tsetserleg_id, b.jil_id, b.ner, b.turul, b.bagsh_id, b.tuslah_bagsh_id ?? null]);
      return { buleg_id: x.insertId };
    });
    res.status(201).json(out);
  }));
  r.patch('/groups/:id', staff, h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    const b = parse(GroupBody.pick({ ner: true, turul: true, bagsh_id: true, tuslah_bagsh_id: true }).partial(), req.body);
    await db.run(req.actor.id, async (c) => {
      const g = await groupFor(c, req.actor, gid, 'manage');
      await checkTeachers(c, g.tsetserleg_id, [b.bagsh_id, b.tuslah_bagsh_id]);
      await c.query(`UPDATE buleg SET ner = COALESCE(?, ner), turul = COALESCE(?, turul), bagsh_id = COALESCE(?, bagsh_id),
                       tuslah_bagsh_id = IF(?, ?, tuslah_bagsh_id) WHERE buleg_id = ?`,
      [b.ner ?? null, b.turul ?? null, b.bagsh_id ?? null, b.tuslah_bagsh_id !== undefined, b.tuslah_bagsh_id ?? null, gid]);
    });
    res.status(204).end();
  }));

  // ---------------- Хоолны үнэ (PR109, арга зүйч) ----------------
  r.get('/kindergartens/:id/meal-prices', staff, h(async (req, res) => {
    const { id: tid } = parse(idParam, req.params);
    if (req.actor.uureg === 'arga_zuich' && tid !== req.actor.tsetserlegId) throw notFound();
    res.json(await db.run(req.actor.id, (c) => db.q(c, 'SELECT * FROM hoolny_une WHERE tsetserleg_id = ? ORDER BY hugatsaa_ehleh DESC', [tid])));
  }));
  r.post('/kindergartens/:id/meal-prices', requireRole('arga_zuich'), h(async (req, res) => {
    const { id: tid } = parse(idParam, req.params);
    if (tid !== req.actor.tsetserlegId) throw forbidden();
    const b = parse(z.object({ hugatsaa_ehleh: date, neg_odriin_une: z.number().min(0).max(1000000) }), req.body);
    const [x] = await db.run(req.actor.id, (c) => c.query(
      'INSERT INTO hoolny_une (tsetserleg_id, hugatsaa_ehleh, neg_odriin_une, oruulsan_hereglegch) VALUES (?, ?, ?, ?)',
      [tid, b.hugatsaa_ehleh, b.neg_odriin_une, req.actor.id]));
    res.status(201).json({ une_id: x.insertId });
  }));

  // ---------------- Амралтын өдөр ----------------
  r.get('/holidays', h(async (req, res) => {
    const b = parse(z.object({ from: date.optional(), to: date.optional() }), req.query);
    res.json(await db.run(req.actor.id, (c) => db.q(c, `
      SELECT amralt_id, tsetserleg_id, ognoo, ner FROM amraltyn_odor
       WHERE (tsetserleg_id IS NULL OR tsetserleg_id = ?) AND ognoo BETWEEN COALESCE(?, '1000-01-01') AND COALESCE(?, '9999-12-31')
       ORDER BY ognoo`, [req.actor.tsetserlegId ?? null, b.from ?? null, b.to ?? null])));
  }));
  r.post('/holidays', staff, h(async (req, res) => {
    const b = parse(z.object({ ognoo: date, ner: reqText(120), ulsyn: z.boolean().default(false) }), req.body);
    if (b.ulsyn && req.actor.uureg !== 'admin') throw forbidden('Улсын баярыг admin оруулна');
    const tsId = b.ulsyn ? null : req.actor.tsetserlegId;
    if (!b.ulsyn && tsId == null) throw unprocessable('Цэцэрлэг тодорхойгүй');
    const [x] = await db.run(req.actor.id, (c) => c.query('INSERT INTO amraltyn_odor (tsetserleg_id, ognoo, ner) VALUES (?, ?, ?)', [tsId, b.ognoo, b.ner]));
    res.status(201).json({ amralt_id: x.insertId });
  }));
  r.delete('/holidays/:id', staff, h(async (req, res) => {
    const { id: hid } = parse(idParam, req.params);
    await db.run(req.actor.id, async (c) => {
      const x = await db.one(c, 'SELECT tsetserleg_id FROM amraltyn_odor WHERE amralt_id = ?', [hid]);
      if (!x) throw notFound();
      if (req.actor.uureg !== 'admin' && x.tsetserleg_id !== req.actor.tsetserlegId) throw forbidden();
      await c.query('DELETE FROM amraltyn_odor WHERE amralt_id = ?', [hid]);
    });
    res.status(204).end();
  }));

  // ---------------- Хяналтын хуудасны асуулт (PR113, арга зүйч) ----------------
  r.post('/checklist-items', requireRole('arga_zuich'), h(async (req, res) => {
    const b = parse(z.object({ chiglel_id: z.number().int().min(1).max(6), asuult: reqText(255), daraalal: z.number().int().min(1).max(999) }), req.body);
    const [x] = await db.run(req.actor.id, (c) => c.query(
      'INSERT INTO hyanaltyn_asuult (chiglel_id, asuult, daraalal, oruulsan_hereglegch) VALUES (?, ?, ?, ?)',
      [b.chiglel_id, b.asuult, b.daraalal, req.actor.id]));
    res.status(201).json({ asuult_id: x.insertId });
  }));
  r.patch('/checklist-items/:id', requireRole('arga_zuich'), h(async (req, res) => {
    const { id: qid } = parse(idParam, req.params);
    const b = parse(z.object({ idevhtei: z.boolean() }), req.body);
    const [x] = await db.run(req.actor.id, (c) => c.query('UPDATE hyanaltyn_asuult SET idevhtei = ? WHERE asuult_id = ?', [b.idevhtei, qid]));
    if (!x.affectedRows) throw notFound();
    res.status(204).end();
  }));

  // ---------------- Лавлах өгөгдөл ----------------
  r.get('/reference', h(async (req, res) => {
    res.json(await db.run(req.actor.id, async (c) => ({
      chiglel: await db.q(c, 'SELECT * FROM suraltsahuin_chiglel ORDER BY daraalal'),
      rubric_shalguur: await db.q(c, 'SELECT * FROM rubric_shalguur ORDER BY chiglel_id, tuvshin'),
      hyanaltyn_asuult: await db.q(c, 'SELECT asuult_id, chiglel_id, asuult, daraalal FROM hyanaltyn_asuult WHERE idevhtei ORDER BY daraalal'),
      bagshlahui_shalguur: await db.q(c, 'SELECT shalguur_id, shalguur, daraalal FROM bagshlahui_shalguur WHERE idevhtei ORDER BY daraalal'),
    })));
  }));

  return r;
};
