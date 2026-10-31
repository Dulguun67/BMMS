'use strict';
const express = require('express');
const db = require('../db');
const { groupFor, assertMembers } = require('../middleware/access');
const { h, unprocessable, forbidden } = require('../middleware/errors');
const { z, parse, id, idParam } = require('../middleware/validate');

const uyeQuery = z.object({ uye_id: id });

/** Үнэлгээний үе тухайн бүлгийн хичээлийн жилийнх эсэх */
async function checkPeriod(c, g, uyeId) {
  const u = await db.one(c, 'SELECT uye_id FROM unelgee_uye WHERE uye_id = ? AND jil_id = ?', [uyeId, g.jil_id]);
  if (!u) throw unprocessable('Үнэлгээний үе энэ бүлгийн хичээлийн жилийнх биш байна');
}

module.exports = () => {
  const r = express.Router();

  // ======================= Рубрик (PR113, TR104) =======================
  r.get('/groups/:id/rubric', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    const { uye_id: uye } = parse(uyeQuery, req.query);
    res.json(await db.run(req.actor.id, async (c) => {
      await groupFor(c, req.actor, gid);
      return db.q(c, `SELECT r.suraltsagch_id, r.chiglel_id, r.tuvshin FROM rubric_unelgee r
                        JOIN buleg_gishuun g ON g.suraltsagch_id = r.suraltsagch_id AND g.buleg_id = ?
                       WHERE r.uye_id = ?`, [gid, uye]);
    }));
  }));

  r.put('/groups/:id/rubric', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    const b = parse(z.object({ uye_id: id, items: z.array(z.object({ suraltsagch_id: id, chiglel_id: z.number().int().min(1).max(6),
      tuvshin: z.number().int().min(1).max(3).nullable() })).min(1).max(2000) }), req.body);
    await db.tx(req.actor.id, async (c) => {
      const g = await groupFor(c, req.actor, gid, 'write');
      await checkPeriod(c, g, b.uye_id);
      await assertMembers(c, gid, b.items.map((i) => i.suraltsagch_id));
      for (const it of b.items) {
        if (it.tuvshin === null) {
          await c.query('DELETE FROM rubric_unelgee WHERE suraltsagch_id = ? AND uye_id = ? AND chiglel_id = ?', [it.suraltsagch_id, b.uye_id, it.chiglel_id]);
        } else {
          await c.query(`INSERT INTO rubric_unelgee (suraltsagch_id, uye_id, chiglel_id, tuvshin, unelsen_hereglegch) VALUES (?, ?, ?, ?, ?) AS n
                         ON DUPLICATE KEY UPDATE tuvshin = n.tuvshin, unelsen_hereglegch = n.unelsen_hereglegch`,
          [it.suraltsagch_id, b.uye_id, it.chiglel_id, it.tuvshin, req.actor.id]);
        }
      }
    });
    res.status(204).end();
  }));

  // Бүлгийн дундаж, анхаарах чиглэл (AR102)
  r.get('/groups/:id/rubric/summary', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    res.json(await db.run(req.actor.id, async (c) => {
      await groupFor(c, req.actor, gid);
      return db.q(c, 'SELECT * FROM v_rubric_buleg_dundaj WHERE buleg_id = ? ORDER BY uye_id, chiglel_id', [gid]);
    }));
  }));

  // Хүүхэд бүрийн ахиц: эхлэлийн → сүүлийн үе (BR102)
  r.get('/groups/:id/rubric/progress', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    res.json(await db.run(req.actor.id, async (c) => {
      const g = await groupFor(c, req.actor, gid);
      return db.q(c, `SELECT v.*, s.ovog, s.ner FROM v_rubric_ahits v
                        JOIN buleg_gishuun g ON g.suraltsagch_id = v.suraltsagch_id AND g.buleg_id = ?
                        JOIN suraltsagch s ON s.suraltsagch_id = v.suraltsagch_id
                       WHERE v.jil_id = ? ORDER BY v.ahits`, [gid, g.jil_id]);
    }));
  }));

  // ======================= Хяналтын хуудас =======================
  r.get('/groups/:id/checklist', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    const { uye_id: uye } = parse(uyeQuery, req.query);
    res.json(await db.run(req.actor.id, async (c) => {
      await groupFor(c, req.actor, gid);
      return db.q(c, `SELECT h.suraltsagch_id, h.asuult_id, h.chaddag FROM hyanaltyn_unelgee h
                        JOIN buleg_gishuun g ON g.suraltsagch_id = h.suraltsagch_id AND g.buleg_id = ?
                       WHERE h.uye_id = ?`, [gid, uye]);
    }));
  }));

  r.put('/groups/:id/checklist', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    const b = parse(z.object({ uye_id: id, items: z.array(z.object({ suraltsagch_id: id, asuult_id: id, chaddag: z.boolean().nullable() })).min(1).max(5000) }), req.body);
    await db.tx(req.actor.id, async (c) => {
      const g = await groupFor(c, req.actor, gid, 'write');
      await checkPeriod(c, g, b.uye_id);
      await assertMembers(c, gid, b.items.map((i) => i.suraltsagch_id));
      for (const it of b.items) {
        if (it.chaddag === null) {
          await c.query('DELETE FROM hyanaltyn_unelgee WHERE suraltsagch_id = ? AND uye_id = ? AND asuult_id = ?', [it.suraltsagch_id, b.uye_id, it.asuult_id]);
        } else {
          await c.query(`INSERT INTO hyanaltyn_unelgee (suraltsagch_id, uye_id, asuult_id, chaddag, unelsen_hereglegch) VALUES (?, ?, ?, ?, ?) AS n
                         ON DUPLICATE KEY UPDATE chaddag = n.chaddag, unelsen_hereglegch = n.unelsen_hereglegch`,
          [it.suraltsagch_id, b.uye_id, it.asuult_id, it.chaddag, req.actor.id]);
        }
      }
    });
    res.status(204).end();
  }));

  r.get('/groups/:id/checklist/summary', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    const { uye_id: uye } = parse(uyeQuery, req.query);
    res.json(await db.run(req.actor.id, async (c) => {
      await groupFor(c, req.actor, gid);
      return db.q(c, 'SELECT * FROM v_hyanaltyn_huvi WHERE buleg_id = ? AND uye_id = ? ORDER BY asuult_id', [gid, uye]);
    }));
  }));

  // ======================= Багш өөрийн үнэлгээ =======================
  r.get('/self-eval', h(async (req, res) => {
    const { uye_id: uye } = parse(uyeQuery, req.query);
    if (!req.actor.bagshId) throw forbidden('Багшийн профайлгүй хэрэглэгч');
    res.json(await db.run(req.actor.id, (c) => db.q(c,
      'SELECT shalguur_id, onoo FROM bagshlahui_unelgee WHERE bagsh_id = ? AND uye_id = ?', [req.actor.bagshId, uye])));
  }));
  r.put('/self-eval', h(async (req, res) => {
    if (!req.actor.bagshId) throw forbidden('Багшийн профайлгүй хэрэглэгч');
    const b = parse(z.object({ uye_id: id, items: z.array(z.object({ shalguur_id: id, onoo: z.number().int().min(1).max(3).nullable() })).min(1).max(100) }), req.body);
    await db.tx(req.actor.id, async (c) => {
      for (const it of b.items) {
        if (it.onoo === null) {
          await c.query('DELETE FROM bagshlahui_unelgee WHERE bagsh_id = ? AND uye_id = ? AND shalguur_id = ?', [req.actor.bagshId, b.uye_id, it.shalguur_id]);
        } else {
          await c.query(`INSERT INTO bagshlahui_unelgee (bagsh_id, uye_id, shalguur_id, onoo) VALUES (?, ?, ?, ?) AS n
                         ON DUPLICATE KEY UPDATE onoo = n.onoo`, [req.actor.bagshId, b.uye_id, it.shalguur_id, it.onoo]);
        }
      }
    });
    res.status(204).end();
  }));

  // ======================= Төлөвлөгөөнд зориулсан санал (BR101, TR101) =======================
  // Тухайн үеийн рубрик, хяналтын хуудаснаас анхаарах чиглэл, чадварыг гаргана.
  r.get('/groups/:id/plan-insight', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    const { uye_id: uye } = parse(uyeQuery, req.query);
    res.json(await db.run(req.actor.id, async (c) => {
      await groupFor(c, req.actor, gid);
      return {
        anhaarah_chiglel: await db.q(c, `SELECT chiglel_id, chiglel, dundaj FROM v_rubric_buleg_dundaj
                                           WHERE buleg_id = ? AND uye_id = ? AND anhaarah ORDER BY dundaj`, [gid, uye]),
        sul_chadvar: await db.q(c, `SELECT asuult_id, chiglel_id, asuult, chaddag_huvi FROM v_hyanaltyn_huvi
                                     WHERE buleg_id = ? AND uye_id = ? AND anhaarah ORDER BY chaddag_huvi`, [gid, uye]),
      };
    }));
  }));

  return r;
};
