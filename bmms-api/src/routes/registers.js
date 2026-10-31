'use strict';
const express = require('express');
const db = require('../db');
const { groupFor, childFor, assertMembers } = require('../middleware/access');
const { h, notFound, unprocessable } = require('../middleware/errors');
const { z, parse, id, date, datetime, month, monthStart, text, reqText, idParam, ENUM } = require('../middleware/validate');

const pad = (n) => String(n).padStart(2, '0');
function weekdays(m, holidays) {
  const [y, mo] = m.split('-').map(Number);
  const out = [];
  for (let d = 1; d <= 31; d++) {
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCMonth() !== mo - 1) break;
    const s = `${y}-${pad(mo)}-${pad(d)}`;
    if (dt.getUTCDay() !== 0 && dt.getUTCDay() !== 6 && !holidays.has(s)) out.push(s);
  }
  return out;
}
const rosterSql = `SELECT s.suraltsagch_id, s.ovog, s.ner FROM buleg_gishuun g JOIN suraltsagch s ON s.suraltsagch_id = g.suraltsagch_id
                    WHERE g.buleg_id = ? AND g.elssen_ognoo <= LAST_DAY(?) AND (g.garsan_ognoo IS NULL OR g.garsan_ognoo >= ?) ORDER BY s.ner`;

module.exports = () => {
  const r = express.Router();

  // ======================= Ирц (PR108, PR109) =======================
  r.get('/groups/:id/attendance', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    const { month: m } = parse(z.object({ month }), req.query);
    res.json(await db.run(req.actor.id, async (c) => {
      const g = await groupFor(c, req.actor, gid);
      const start = monthStart(m);
      const hol = await db.q(c, `SELECT ognoo FROM amraltyn_odor WHERE (tsetserleg_id IS NULL OR tsetserleg_id = ?)
                                  AND ognoo BETWEEN ? AND LAST_DAY(?)`, [g.tsetserleg_id, start, start]);
      return {
        sar: m,
        ajlyn_odor: weekdays(m, new Set(hol.map((x) => x.ognoo))),
        huuhed: await db.q(c, rosterSql, [gid, start, start]),
        irts: await db.q(c, 'SELECT suraltsagch_id, ognoo, tuluv FROM irts WHERE buleg_id = ? AND ognoo BETWEEN ? AND LAST_DAY(?) ORDER BY ognoo',
          [gid, start, start]),
      };
    }));
  }));

  // Бөөнөөр бүртгэх/засах. tuluv=null бол бүртгэлийг устгана.
  r.put('/groups/:id/attendance', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    const b = parse(z.object({ items: z.array(z.object({ suraltsagch_id: id, ognoo: date, tuluv: z.enum(ENUM.irts).nullable() })).min(1).max(1000) }), req.body);
    const out = await db.tx(req.actor.id, async (c) => {
      await groupFor(c, req.actor, gid, 'write');
      let upserted = 0; let deleted = 0;
      for (const it of b.items) {
        if (it.tuluv === null) {
          const [x] = await c.query('DELETE FROM irts WHERE suraltsagch_id = ? AND ognoo = ? AND buleg_id = ?', [it.suraltsagch_id, it.ognoo, gid]);
          deleted += x.affectedRows;
        } else {
          // Trigger: ирээдүйн огноо, тухайн өдөр бүлгийн гишүүн эсэхийг шалгана
          await c.query(`INSERT INTO irts (suraltsagch_id, buleg_id, ognoo, tuluv, burtgesen_hereglegch) VALUES (?, ?, ?, ?, ?) AS n
                         ON DUPLICATE KEY UPDATE tuluv = n.tuluv, burtgesen_hereglegch = n.burtgesen_hereglegch`,
          [it.suraltsagch_id, gid, it.ognoo, it.tuluv, req.actor.id]);
          upserted++;
        }
      }
      return { upserted, deleted };
    });
    res.json(out);
  }));

  r.post('/groups/:id/attendance/fill', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    const b = parse(z.object({ ognoo: date }), req.body);
    const out = await db.run(req.actor.id, async (c) => {
      await groupFor(c, req.actor, gid, 'write');
      const [sets] = await c.query('CALL sp_irts_buglu(?, ?, ?)', [gid, b.ognoo, req.actor.id]);
      return { nemegdsen: sets[0][0].nemegdsen };
    });
    res.json(out);
  }));

  r.get('/groups/:id/attendance/summary', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    const { period } = parse(z.object({ period: z.enum(['month', 'quarter', 'year']).default('month') }), req.query);
    const view = { month: 'v_irts_sar', quarter: 'v_irts_uliral', year: 'v_irts_jil' }[period];
    const order = { month: 'sar', quarter: 'jil, uliral', year: 'jil_id' }[period];
    res.json(await db.run(req.actor.id, async (c) => {
      await groupFor(c, req.actor, gid);
      return db.q(c, `SELECT * FROM ${view} WHERE buleg_id = ? ORDER BY ${order}`, [gid]);
    }));
  }));

  // ======================= Фонтын хураамж (PR107) =======================
  r.get('/groups/:id/fees', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    res.json(await db.run(req.actor.id, async (c) => {
      const g = await groupFor(c, req.actor, gid);
      return {
        khuraamj: await db.q(c, `SELECT f.suraltsagch_id, DATE_FORMAT(f.sar, '%Y-%m') AS sar, f.tuluv, f.dun
                                   FROM font_khuraamj f JOIN buleg_gishuun g ON g.suraltsagch_id = f.suraltsagch_id AND g.buleg_id = ?
                                   JOIN hicheeliin_jil j ON j.jil_id = ?
                                  WHERE f.sar BETWEEN j.ehleh_ognoo AND j.duusah_ognoo ORDER BY f.sar`, [gid, g.jil_id]),
        negtgel: await db.q(c, 'SELECT * FROM v_font_sar WHERE buleg_id = ? ORDER BY sar', [gid]),
      };
    }));
  }));

  r.put('/groups/:id/fees', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    const b = parse(z.object({ items: z.array(z.object({ suraltsagch_id: id, sar: month, tuluv: z.enum(ENUM.font).nullable(),
      dun: z.number().min(0).max(10000000).nullable().optional() })).min(1).max(1000) }), req.body);
    await db.tx(req.actor.id, async (c) => {
      await groupFor(c, req.actor, gid, 'write');
      await assertMembers(c, gid, b.items.map((i) => i.suraltsagch_id));
      for (const it of b.items) {
        if (it.tuluv === null) {
          await c.query('DELETE FROM font_khuraamj WHERE suraltsagch_id = ? AND sar = ?', [it.suraltsagch_id, monthStart(it.sar)]);
        } else {
          await c.query(`INSERT INTO font_khuraamj (suraltsagch_id, sar, tuluv, dun, burtgesen_hereglegch) VALUES (?, ?, ?, ?, ?) AS n
                         ON DUPLICATE KEY UPDATE tuluv = n.tuluv, dun = n.dun, burtgesen_hereglegch = n.burtgesen_hereglegch`,
          [it.suraltsagch_id, monthStart(it.sar), it.tuluv, it.dun ?? null, req.actor.id]);
        }
      }
    });
    res.status(204).end();
  }));

  // ======================= Kinder police (PR110) =======================
  r.get('/groups/:id/kinder-police', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    const { from } = parse(z.object({ from: date.optional() }), req.query);
    res.json(await db.run(req.actor.id, async (c) => {
      await groupFor(c, req.actor, gid);
      return db.q(c, `SELECT k.kp_id, k.ehleh_tsag, k.temdeglel, k.suraltsagch_id, s.ner AS huuhed_ner,
                             k.asran_id, a.ovog AS asran_ovog, a.ner AS asran_ner, sa.hen_boloh
                        FROM kinder_police k JOIN suraltsagch s ON s.suraltsagch_id = k.suraltsagch_id
                        JOIN asran_hamgaalagch a ON a.asran_id = k.asran_id
                        JOIN suraltsagch_asran sa ON sa.suraltsagch_id = k.suraltsagch_id AND sa.asran_id = k.asran_id
                        JOIN buleg_gishuun g ON g.suraltsagch_id = k.suraltsagch_id AND g.buleg_id = ?
                       WHERE k.ehleh_tsag >= COALESCE(?, '1000-01-01') ORDER BY k.ehleh_tsag`, [gid, from ?? null]);
    }));
  }));
  r.post('/children/:id/kinder-police', h(async (req, res) => {
    const { id: cid } = parse(idParam, req.params);
    const b = parse(z.object({ asran_id: id, ehleh_tsag: datetime, temdeglel: text(255).optional() }), req.body);
    const [x] = await db.run(req.actor.id, async (c) => {
      await childFor(c, req.actor, cid, 'write');
      return c.query('INSERT INTO kinder_police (suraltsagch_id, asran_id, ehleh_tsag, temdeglel) VALUES (?, ?, ?, ?)',
        [cid, b.asran_id, b.ehleh_tsag, b.temdeglel ?? null]);
    });
    res.status(201).json({ kp_id: x.insertId });
  }));
  r.delete('/kinder-police/:id', h(async (req, res) => {
    const { id: kid } = parse(idParam, req.params);
    await db.run(req.actor.id, async (c) => {
      const k = await db.one(c, 'SELECT suraltsagch_id FROM kinder_police WHERE kp_id = ?', [kid]);
      if (!k) throw notFound();
      await childFor(c, req.actor, k.suraltsagch_id, 'write');
      await c.query('DELETE FROM kinder_police WHERE kp_id = ?', [kid]);
    });
    res.status(204).end();
  }));

  // ======================= Өсөлтийн судалгаа (PR111) =======================
  r.get('/groups/:id/growth', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    const f = parse(z.object({ on: z.coerce.number().int().optional(), uliral: z.enum(['Намар', 'Хавар']).optional() }), req.query);
    res.json(await db.run(req.actor.id, async (c) => {
      await groupFor(c, req.actor, gid);
      return {
        hemjilt: await db.q(c, `SELECT o.* FROM osolt o JOIN buleg_gishuun g ON g.suraltsagch_id = o.suraltsagch_id AND g.buleg_id = ?
                                 WHERE (? IS NULL OR o.hemjilt_on = ?) AND (? IS NULL OR o.uliral = ?)
                                 ORDER BY o.suraltsagch_id, o.hemjilt_on, o.uliral`,
        [gid, f.on ?? null, f.on ?? null, f.uliral ?? null, f.uliral ?? null]),
        negtgel: await db.q(c, 'SELECT * FROM v_osolt_buleg WHERE buleg_id = ? ORDER BY hemjilt_on, uliral', [gid]),
      };
    }));
  }));
  r.put('/children/:id/growth', h(async (req, res) => {
    const { id: cid } = parse(idParam, req.params);
    const num = (lo, hi) => z.number().min(lo).max(hi).nullable().optional();
    const b = parse(z.object({ hemjilt_on: z.number().int().min(2020).max(2100), uliral: z.enum(['Намар', 'Хавар']), hemjsen_ognoo: date,
      jin: num(5, 60), undur: num(50, 160), tolgoi_toirog: num(30, 70), tseej_toirog: num(30, 100), centil: num(0, 100),
      unelgee: z.enum(ENUM.osoltUnelgee).nullable().optional() }), req.body);
    await db.run(req.actor.id, async (c) => {
      await childFor(c, req.actor, cid, 'write');
      const { nas } = await db.one(c, 'SELECT TIMESTAMPDIFF(MONTH, torson_ognoo, ?) AS nas FROM suraltsagch WHERE suraltsagch_id = ?', [b.hemjsen_ognoo, cid]);
      await c.query(`INSERT INTO osolt (suraltsagch_id, hemjilt_on, uliral, hemjsen_ognoo, nas_sar, jin, undur, tolgoi_toirog, tseej_toirog,
                                        centil, unelgee, burtgesen_hereglegch)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) AS n
                     ON DUPLICATE KEY UPDATE hemjsen_ognoo = n.hemjsen_ognoo, nas_sar = n.nas_sar, jin = n.jin, undur = n.undur,
                       tolgoi_toirog = n.tolgoi_toirog, tseej_toirog = n.tseej_toirog, centil = n.centil, unelgee = n.unelgee,
                       burtgesen_hereglegch = n.burtgesen_hereglegch`,
      [cid, b.hemjilt_on, b.uliral, b.hemjsen_ognoo, Math.max(0, nas), b.jin ?? null, b.undur ?? null, b.tolgoi_toirog ?? null,
        b.tseej_toirog ?? null, b.centil ?? null, b.unelgee ?? null, req.actor.id]);
    });
    res.status(204).end();
  }));

  // ======================= Анги, танхим (PR112) =======================
  r.get('/groups/:id/materials', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    res.json(await db.run(req.actor.id, async (c) => {
      await groupFor(c, req.actor, gid);
      return db.q(c, 'SELECT * FROM surgaltyn_heregsel WHERE buleg_id = ? ORDER BY angilal, ner', [gid]);
    }));
  }));
  const Material = z.object({ ner: reqText(120), angilal: z.enum(ENUM.angilal), too_shirheg: z.number().int().min(0).max(65535),
    tuluv_temdeglel: text(255).nullable().optional() });
  r.post('/groups/:id/materials', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    const b = parse(Material, req.body);
    const [x] = await db.run(req.actor.id, async (c) => {
      await groupFor(c, req.actor, gid, 'write');
      return c.query('INSERT INTO surgaltyn_heregsel (buleg_id, ner, angilal, too_shirheg, tuluv_temdeglel) VALUES (?, ?, ?, ?, ?)',
        [gid, b.ner, b.angilal, b.too_shirheg, b.tuluv_temdeglel ?? null]);
    });
    res.status(201).json({ heregsel_id: x.insertId });
  }));
  async function materialGroup(c, actor, mid) {
    const m = await db.one(c, 'SELECT buleg_id FROM surgaltyn_heregsel WHERE heregsel_id = ?', [mid]);
    if (!m) throw notFound();
    await groupFor(c, actor, m.buleg_id, 'write');
  }
  r.patch('/materials/:id', h(async (req, res) => {
    const { id: mid } = parse(idParam, req.params);
    const b = parse(Material.partial(), req.body);
    const fields = Object.keys(b);
    if (!fields.length) throw unprocessable('Өөрчлөх талбар алга');
    await db.run(req.actor.id, async (c) => {
      await materialGroup(c, req.actor, mid);
      await c.query(`UPDATE surgaltyn_heregsel SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE heregsel_id = ?`,
        [...fields.map((f) => b[f] ?? null), mid]);
    });
    res.status(204).end();
  }));
  r.delete('/materials/:id', h(async (req, res) => {
    const { id: mid } = parse(idParam, req.params);
    await db.run(req.actor.id, async (c) => { await materialGroup(c, req.actor, mid); await c.query('DELETE FROM surgaltyn_heregsel WHERE heregsel_id = ?', [mid]); });
    res.status(204).end();
  }));

  r.get('/groups/:id/supplies', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    res.json(await db.run(req.actor.id, async (c) => {
      await groupFor(c, req.actor, gid);
      return {
        turul: await db.q(c, 'SELECT turul_id, ner FROM hicheeliin_heregsel_turul WHERE buleg_id = ? ORDER BY turul_id', [gid]),
        uldegdel: await db.q(c, `SELECT hh.suraltsagch_id, hh.turul_id, hh.too FROM hicheeliin_heregsel hh
                                   JOIN hicheeliin_heregsel_turul t ON t.turul_id = hh.turul_id WHERE t.buleg_id = ?`, [gid]),
      };
    }));
  }));
  r.post('/groups/:id/supply-types', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    const b = parse(z.object({ ner: reqText(80) }), req.body);
    const [x] = await db.run(req.actor.id, async (c) => {
      await groupFor(c, req.actor, gid, 'write');
      return c.query('INSERT INTO hicheeliin_heregsel_turul (buleg_id, ner) VALUES (?, ?)', [gid, b.ner]);
    });
    res.status(201).json({ turul_id: x.insertId });
  }));
  r.delete('/supply-types/:id', h(async (req, res) => {
    const { id: tid } = parse(idParam, req.params);
    await db.run(req.actor.id, async (c) => {
      const t = await db.one(c, 'SELECT buleg_id FROM hicheeliin_heregsel_turul WHERE turul_id = ?', [tid]);
      if (!t) throw notFound();
      await groupFor(c, req.actor, t.buleg_id, 'write');
      await c.query('DELETE FROM hicheeliin_heregsel_turul WHERE turul_id = ?', [tid]);
    });
    res.status(204).end();
  }));
  r.put('/groups/:id/supplies', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    const b = parse(z.object({ items: z.array(z.object({ suraltsagch_id: id, turul_id: id, too: z.number().int().min(0).max(1000) })).min(1).max(2000) }), req.body);
    await db.tx(req.actor.id, async (c) => {
      await groupFor(c, req.actor, gid, 'write');
      await assertMembers(c, gid, b.items.map((i) => i.suraltsagch_id));
      const types = new Set((await db.q(c, 'SELECT turul_id FROM hicheeliin_heregsel_turul WHERE buleg_id = ?', [gid])).map((t) => t.turul_id));
      if (b.items.some((i) => !types.has(i.turul_id))) throw unprocessable('Хэрэглэгдэхүүний төрөл энэ бүлгийнх биш байна');
      for (const it of b.items) {
        await c.query(`INSERT INTO hicheeliin_heregsel (suraltsagch_id, turul_id, too) VALUES (?, ?, ?) AS n
                       ON DUPLICATE KEY UPDATE too = n.too`, [it.suraltsagch_id, it.turul_id, it.too]);
      }
    });
    res.status(204).end();
  }));

  return r;
};
