'use strict';
const express = require('express');
const db = require('../db');
const { groupFor } = require('../middleware/access');
const { requireRole } = require('../middleware/auth');
const { h, notFound, forbidden, conflict, unprocessable } = require('../middleware/errors');
const { z, parse, id, date, month, monthStart, text, reqText, idParam, ENUM } = require('../middleware/validate');

const PlanBody = z.object({
  turul: z.enum(ENUM.tlTurul),
  garchig: reqText(200),
  hugatsaa_ehleh: date,
  hugatsaa_duusah: date,
  ehleh_tuluvluguu_id: id.nullable().optional(),
  zorilgo: text(10000).nullable().optional(),
  aguulga: text(20000).nullable().optional(),
  heregsel: text(5000).nullable().optional(),
  surgaltyn_helber: z.enum(ENUM.helber).nullable().optional(),
  chiglel: z.array(z.number().int().min(1).max(6)).max(6).optional(),
  alham: z.array(reqText(500)).max(50).optional(),
});
const ReportBody = z.object({
  sar: month,
  tuluvluguu_id: id.nullable().optional(),
  hiigdsen_ajil: reqText(20000),
  ur_dun: text(20000).nullable().optional(),
  dugnelt: text(20000).nullable().optional(),
  daraagiin_sar: text(10000).nullable().optional(),
});
const Transition = z.object({ to: z.enum(['Хянагдаж буй', 'Батлагдсан', 'Буцаасан']), tekst: text(5000).nullable().optional() });
const Comment = z.object({ tekst: reqText(5000) });
const EDITABLE = ['Ноорог', 'Буцаасан'];

async function setChildren(c, planId, b) {
  if (b.chiglel) {
    await c.query('DELETE FROM tuluvluguu_chiglel WHERE tuluvluguu_id = ?', [planId]);
    for (const ch of new Set(b.chiglel)) await c.query('INSERT INTO tuluvluguu_chiglel (tuluvluguu_id, chiglel_id) VALUES (?, ?)', [planId, ch]);
  }
  if (b.alham) {
    await c.query('DELETE FROM tuluvluguu_alham WHERE tuluvluguu_id = ?', [planId]);
    let i = 1;
    for (const a of b.alham) await c.query('INSERT INTO tuluvluguu_alham (tuluvluguu_id, daraalal, alham) VALUES (?, ?, ?)', [planId, i++, a]);
  }
}

async function loadPlan(c, actor, planId, mode = 'read') {
  const p = await db.one(c, 'SELECT * FROM tuluvluguu WHERE tuluvluguu_id = ?', [planId]);
  if (!p) throw notFound('Төлөвлөгөө олдсонгүй');
  try { await groupFor(c, actor, p.buleg_id, mode); } catch (e) { if (e.status === 404) throw notFound('Төлөвлөгөө олдсонгүй'); throw e; }
  if (mode === 'write' && p.bolovsruulsan_bagsh !== actor.bagshId) throw forbidden('Зөвхөн боловсруулсан багш засна');
  return p;
}
async function loadReport(c, actor, reportId, mode = 'read') {
  const t = await db.one(c, "SELECT *, DATE_FORMAT(sar, '%Y-%m') AS sar_str FROM tailan WHERE tailan_id = ?", [reportId]);
  if (!t) throw notFound('Тайлан олдсонгүй');
  try { await groupFor(c, actor, t.buleg_id, mode); } catch (e) { if (e.status === 404) throw notFound('Тайлан олдсонгүй'); throw e; }
  if (mode === 'write' && t.bolovsruulsan_bagsh !== actor.bagshId) throw forbidden('Зөвхөн боловсруулсан багш засна');
  return t;
}
const comments = (c, col, oid) => db.q(c, `
  SELECT s.shuumj_id, s.uildel, s.tekst, s.created_at, s.hereglegch_id, h.uureg, b.ovog, b.ner
    FROM sanal_shuumj s JOIN hereglegch h ON h.hereglegch_id = s.hereglegch_id LEFT JOIN bagsh b ON b.hereglegch_id = h.hereglegch_id
   WHERE s.${col} = ? ORDER BY s.created_at, s.shuumj_id`, [oid]);

module.exports = () => {
  const r = express.Router();

  // ======================= Төлөвлөгөө =======================
  r.get('/groups/:id/plans', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    const f = parse(z.object({ turul: z.enum(ENUM.tlTurul).optional(), tuluv: z.enum(['Ноорог', 'Хянагдаж буй', 'Батлагдсан', 'Буцаасан']).optional() }), req.query);
    res.json(await db.run(req.actor.id, async (c) => {
      await groupFor(c, req.actor, gid);
      return db.q(c, `SELECT t.tuluvluguu_id, t.ehleh_tuluvluguu_id, t.turul, t.garchig, t.hugatsaa_ehleh, t.hugatsaa_duusah, t.tuluv,
                             t.updated_at, GROUP_CONCAT(tc.chiglel_id ORDER BY tc.chiglel_id) AS chiglel
                        FROM tuluvluguu t LEFT JOIN tuluvluguu_chiglel tc ON tc.tuluvluguu_id = t.tuluvluguu_id
                       WHERE t.buleg_id = ? AND (? IS NULL OR t.turul = ?) AND (? IS NULL OR t.tuluv = ?)
                       GROUP BY t.tuluvluguu_id ORDER BY t.turul + 0, t.hugatsaa_ehleh`,
      [gid, f.turul ?? null, f.turul ?? null, f.tuluv ?? null, f.tuluv ?? null]);
    }));
  }));

  r.post('/groups/:id/plans', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    const b = parse(PlanBody, req.body);
    const out = await db.tx(req.actor.id, async (c) => {
      await groupFor(c, req.actor, gid, 'write');
      // Trigger: шатлал ижил бүлэг, дээд шат байх; шинэ төлөвлөгөө ноорог
      const [x] = await c.query(`INSERT INTO tuluvluguu (buleg_id, ehleh_tuluvluguu_id, turul, garchig, hugatsaa_ehleh, hugatsaa_duusah,
                                   zorilgo, aguulga, heregsel, surgaltyn_helber, bolovsruulsan_bagsh)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [gid, b.ehleh_tuluvluguu_id ?? null, b.turul, b.garchig, b.hugatsaa_ehleh, b.hugatsaa_duusah, b.zorilgo ?? null,
        b.aguulga ?? null, b.heregsel ?? null, b.surgaltyn_helber ?? null, req.actor.bagshId]);
      await setChildren(c, x.insertId, b);
      return { tuluvluguu_id: x.insertId };
    });
    res.status(201).json(out);
  }));

  r.get('/plans/:id', h(async (req, res) => {
    const { id: pid } = parse(idParam, req.params);
    res.json(await db.run(req.actor.id, async (c) => {
      const p = await loadPlan(c, req.actor, pid);
      return {
        ...p,
        chiglel: (await db.q(c, 'SELECT chiglel_id FROM tuluvluguu_chiglel WHERE tuluvluguu_id = ? ORDER BY chiglel_id', [pid])).map((x) => x.chiglel_id),
        alham: (await db.q(c, 'SELECT alham FROM tuluvluguu_alham WHERE tuluvluguu_id = ? ORDER BY daraalal', [pid])).map((x) => x.alham),
        dood_tuluvluguu: await db.q(c, 'SELECT tuluvluguu_id, turul, garchig, tuluv FROM tuluvluguu WHERE ehleh_tuluvluguu_id = ? ORDER BY hugatsaa_ehleh', [pid]),
        sanal_shuumj: await comments(c, 'tuluvluguu_id', pid),
      };
    }));
  }));

  r.patch('/plans/:id', h(async (req, res) => {
    const { id: pid } = parse(idParam, req.params);
    const b = parse(PlanBody.omit({ turul: true }).partial(), req.body);
    await db.tx(req.actor.id, async (c) => {
      const p = await loadPlan(c, req.actor, pid, 'write');
      if (!EDITABLE.includes(p.tuluv)) throw conflict('Зөвхөн ноорог эсвэл буцаасан төлөвлөгөөг засна');
      const cols = ['garchig', 'hugatsaa_ehleh', 'hugatsaa_duusah', 'ehleh_tuluvluguu_id', 'zorilgo', 'aguulga', 'heregsel', 'surgaltyn_helber']
        .filter((k) => b[k] !== undefined);
      // Буцаасан төлөвлөгөөг засахад ноорог болно
      await c.query(`UPDATE tuluvluguu SET ${cols.map((k) => `${k} = ?`).concat('tuluv = ?').join(', ')} WHERE tuluvluguu_id = ?`,
        [...cols.map((k) => b[k] ?? null), 'Ноорог', pid]);
      await setChildren(c, pid, b);
    });
    res.status(204).end();
  }));

  r.delete('/plans/:id', h(async (req, res) => {
    const { id: pid } = parse(idParam, req.params);
    await db.run(req.actor.id, async (c) => {
      const p = await loadPlan(c, req.actor, pid, 'write');
      if (p.tuluv !== 'Ноорог') throw conflict('Зөвхөн ноорог төлөвлөгөөг устгана');
      await c.query('DELETE FROM tuluvluguu WHERE tuluvluguu_id = ?', [pid]);
    });
    res.status(204).end();
  }));

  // Илгээх / батлах / буцаах: эрхийг sp_batlah_urgal өгөгдлийн санд дахин шалгана
  r.post('/plans/:id/transition', h(async (req, res) => {
    const { id: pid } = parse(idParam, req.params);
    const b = parse(Transition, req.body);
    await db.run(req.actor.id, async (c) => {
      await loadPlan(c, req.actor, pid);
      await c.query('CALL sp_batlah_urgal(?, ?, ?, ?, ?)', ['tuluvluguu', pid, req.actor.id, b.to, b.tekst ?? null]);
    });
    res.status(204).end();
  }));

  r.post('/plans/:id/comments', h(async (req, res) => {
    const { id: pid } = parse(idParam, req.params);
    const b = parse(Comment, req.body);
    const [x] = await db.run(req.actor.id, async (c) => {
      await loadPlan(c, req.actor, pid);
      return c.query("INSERT INTO sanal_shuumj (tuluvluguu_id, hereglegch_id, uildel, tekst) VALUES (?, ?, 'Сэтгэгдэл', ?)", [pid, req.actor.id, b.tekst]);
    });
    res.status(201).json({ shuumj_id: x.insertId });
  }));

  // ======================= Сарын тайлан =======================
  r.get('/groups/:id/reports', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    res.json(await db.run(req.actor.id, async (c) => {
      await groupFor(c, req.actor, gid);
      return db.q(c, `SELECT t.tailan_id, DATE_FORMAT(t.sar, '%Y-%m') AS sar, t.tuluvluguu_id, t.tuluv, t.updated_at,
                             v.guitsetgel_huvi FROM tailan t
                        LEFT JOIN v_irts_sar v ON v.buleg_id = t.buleg_id AND v.sar = t.sar
                       WHERE t.buleg_id = ? ORDER BY t.sar DESC`, [gid]);
    }));
  }));

  r.post('/groups/:id/reports', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    const b = parse(ReportBody, req.body);
    const [x] = await db.run(req.actor.id, async (c) => {
      await groupFor(c, req.actor, gid, 'write');
      return c.query(`INSERT INTO tailan (buleg_id, tuluvluguu_id, sar, hiigdsen_ajil, ur_dun, dugnelt, daraagiin_sar, bolovsruulsan_bagsh)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [gid, b.tuluvluguu_id ?? null, monthStart(b.sar), b.hiigdsen_ajil, b.ur_dun ?? null, b.dugnelt ?? null, b.daraagiin_sar ?? null, req.actor.bagshId]);
    });
    res.status(201).json({ tailan_id: x.insertId });
  }));

  // Тайлан + автомат тоон мэдээлэл (ирц, рубрикийн сүүлийн үе, тухайн сарын үйл ажиллагаа)
  r.get('/reports/:id', h(async (req, res) => {
    const { id: rid } = parse(idParam, req.params);
    res.json(await db.run(req.actor.id, async (c) => {
      const t = await loadReport(c, req.actor, rid);
      const { sar_str: sarStr, ...rest } = t;
      const lastUye = await db.one(c, `SELECT v.uye_id FROM v_rubric_buleg_dundaj v JOIN unelgee_uye u ON u.uye_id = v.uye_id
                                         WHERE v.buleg_id = ? ORDER BY u.turul + 0 DESC LIMIT 1`, [t.buleg_id]);
      return {
        ...rest,
        sar: sarStr,
        statistik: {
          irts: (await db.one(c, 'SELECT * FROM v_irts_sar WHERE buleg_id = ? AND sar = ?', [t.buleg_id, t.sar])) || null,
          rubric: lastUye ? await db.q(c, 'SELECT uye, chiglel_id, chiglel, dundaj, anhaarah FROM v_rubric_buleg_dundaj WHERE buleg_id = ? AND uye_id = ? ORDER BY chiglel_id',
            [t.buleg_id, lastUye.uye_id]) : [],
          uil_ajillagaa: await db.q(c, `SELECT tuluvluguu_id, garchig, hugatsaa_ehleh, tuluv FROM tuluvluguu
                                         WHERE buleg_id = ? AND turul = 'Үйл ажиллагааны' AND hugatsaa_ehleh BETWEEN ? AND LAST_DAY(?)
                                         ORDER BY hugatsaa_ehleh`, [t.buleg_id, t.sar, t.sar]),
        },
        sanal_shuumj: await comments(c, 'tailan_id', rid),
      };
    }));
  }));

  r.patch('/reports/:id', h(async (req, res) => {
    const { id: rid } = parse(idParam, req.params);
    const b = parse(ReportBody.partial(), req.body);
    await db.run(req.actor.id, async (c) => {
      const t = await loadReport(c, req.actor, rid, 'write');
      if (!EDITABLE.includes(t.tuluv)) throw conflict('Зөвхөн ноорог эсвэл буцаасан тайланг засна');
      const vals = { ...b, ...(b.sar ? { sar: monthStart(b.sar) } : {}) };
      const cols = ['sar', 'tuluvluguu_id', 'hiigdsen_ajil', 'ur_dun', 'dugnelt', 'daraagiin_sar'].filter((k) => vals[k] !== undefined);
      if (!cols.length) throw unprocessable('Өөрчлөх талбар алга');
      await c.query(`UPDATE tailan SET ${cols.map((k) => `${k} = ?`).concat('tuluv = ?').join(', ')} WHERE tailan_id = ?`,
        [...cols.map((k) => vals[k] ?? null), 'Ноорог', rid]);
    });
    res.status(204).end();
  }));

  r.delete('/reports/:id', h(async (req, res) => {
    const { id: rid } = parse(idParam, req.params);
    await db.run(req.actor.id, async (c) => {
      const t = await loadReport(c, req.actor, rid, 'write');
      if (t.tuluv !== 'Ноорог') throw conflict('Зөвхөн ноорог тайланг устгана');
      await c.query('DELETE FROM tailan WHERE tailan_id = ?', [rid]);
    });
    res.status(204).end();
  }));

  r.post('/reports/:id/transition', h(async (req, res) => {
    const { id: rid } = parse(idParam, req.params);
    const b = parse(Transition, req.body);
    await db.run(req.actor.id, async (c) => {
      await loadReport(c, req.actor, rid);
      await c.query('CALL sp_batlah_urgal(?, ?, ?, ?, ?)', ['tailan', rid, req.actor.id, b.to, b.tekst ?? null]);
    });
    res.status(204).end();
  }));

  r.post('/reports/:id/comments', h(async (req, res) => {
    const { id: rid } = parse(idParam, req.params);
    const b = parse(Comment, req.body);
    const [x] = await db.run(req.actor.id, async (c) => {
      await loadReport(c, req.actor, rid);
      return c.query("INSERT INTO sanal_shuumj (tailan_id, hereglegch_id, uildel, tekst) VALUES (?, ?, 'Сэтгэгдэл', ?)", [rid, req.actor.id, b.tekst]);
    });
    res.status(201).json({ shuumj_id: x.insertId });
  }));

  // ======================= Арга зүйчийн батлах дараалал =======================
  r.get('/approvals', requireRole('arga_zuich'), h(async (req, res) => {
    res.json(await db.run(req.actor.id, (c) => db.q(c,
      'SELECT * FROM v_batlah_huleegdej_bui WHERE tsetserleg_id = ? ORDER BY updated_at', [req.actor.tsetserlegId])));
  }));

  return r;
};
