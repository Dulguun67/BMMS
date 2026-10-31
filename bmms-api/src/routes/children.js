'use strict';
const express = require('express');
const db = require('../db');
const { groupFor, childFor } = require('../middleware/access');
const { h, notFound, unprocessable, HttpError } = require('../middleware/errors');
const { z, parse, id, date, text, reqText, phone, registr, idParam, ENUM } = require('../middleware/validate');

const Address = z.object({ duureg: z.enum(ENUM.duureg), horoo: z.number().int().min(1).max(45),
  delgerengui_hayg: text(255).optional(), toyrgiin_baidal: z.enum(['Тойргийн', 'Тойргийн бус']) });
const ChildBase = z.object({ ovog: reqText(60), ner: reqText(60), registr: registr.nullable().optional(),
  torson_ognoo: date, huis: z.enum(['Эр', 'Эм']), tanih_temdeg: text(60).nullable().optional(), esis_id: text(40).nullable().optional() });

async function upsertAddress(c, childId, a) {
  await c.query(`INSERT INTO toyrgiin_sudalgaa (suraltsagch_id, duureg, horoo, delgerengui_hayg, toyrgiin_baidal)
                 VALUES (?, ?, ?, ?, ?) AS n
                 ON DUPLICATE KEY UPDATE duureg = n.duureg, horoo = n.horoo, delgerengui_hayg = n.delgerengui_hayg,
                                         toyrgiin_baidal = n.toyrgiin_baidal`,
  [childId, a.duureg, a.horoo, a.delgerengui_hayg ?? null, a.toyrgiin_baidal]);
}

module.exports = (cfg) => {
  const r = express.Router();

  // ---------------- Бүлэг ----------------
  r.get('/groups', h(async (req, res) => {
    const a = req.actor;
    res.json(await db.run(a.id, (c) => db.q(c, `
      SELECT b.buleg_id, b.tsetserleg_id, b.jil_id, j.ehleh_on, b.ner, b.turul, b.tuvshin, b.bagsh_id, b.tuslah_bagsh_id,
             (SELECT COUNT(*) FROM buleg_gishuun g WHERE g.buleg_id = b.buleg_id
                AND (g.garsan_ognoo IS NULL OR g.garsan_ognoo >= CURDATE())) AS huuhdiin_too
        FROM buleg b JOIN hicheeliin_jil j ON j.jil_id = b.jil_id
       WHERE ? = 'admin' OR (? = 'bagsh' AND (b.bagsh_id = ? OR b.tuslah_bagsh_id = ?))
          OR (? = 'arga_zuich' AND b.tsetserleg_id = ?)
       ORDER BY j.ehleh_on DESC, b.ner`, [a.uureg, a.uureg, a.bagshId, a.bagshId, a.uureg, a.tsetserlegId])));
  }));

  r.get('/groups/:id', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    res.json(await db.run(req.actor.id, (c) => groupFor(c, req.actor, gid)));
  }));

  r.get('/groups/:id/children', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    res.json(await db.run(req.actor.id, async (c) => {
      await groupFor(c, req.actor, gid);
      // Жагсаалтад хэрэгтэй багана: РД, хаяг, хамгийн сүүлийн шинжилгээний хариу
      return db.q(c, `
        SELECT v.*, s.registr, t.duureg, t.horoo, t.delgerengui_hayg,
               (SELECT e.hariu FROM eruul_mend e WHERE e.suraltsagch_id = v.suraltsagch_id ORDER BY e.ognoo DESC, e.eruul_id DESC LIMIT 1) AS suuliin_shinjilgee
          FROM v_buleg_huuhed v
          JOIN suraltsagch s ON s.suraltsagch_id = v.suraltsagch_id
          LEFT JOIN toyrgiin_sudalgaa t ON t.suraltsagch_id = v.suraltsagch_id
         WHERE v.buleg_id = ? ORDER BY v.ner`, [gid]);
    }));
  }));

  // Хүүхэд бүртгэж бүлэгт элсүүлэх (PR102)
  r.post('/groups/:id/children', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    const b = parse(ChildBase.extend({ elssen_ognoo: date.optional(), hayg: Address.optional() }), req.body);
    const out = await db.tx(req.actor.id, async (c) => {
      await groupFor(c, req.actor, gid, 'write');
      const [x] = await c.query(`INSERT INTO suraltsagch (ovog, ner, registr, torson_ognoo, huis, tanih_temdeg, esis_id)
                                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [b.ovog, b.ner, b.registr ?? null, b.torson_ognoo, b.huis, b.tanih_temdeg ?? null, b.esis_id ?? null]);
      await c.query('INSERT INTO buleg_gishuun (buleg_id, suraltsagch_id, elssen_ognoo) VALUES (?, ?, COALESCE(?, CURDATE()))',
        [gid, x.insertId, b.elssen_ognoo ?? null]);
      if (b.hayg) await upsertAddress(c, x.insertId, b.hayg);
      return { suraltsagch_id: x.insertId };
    });
    res.status(201).json(out);
  }));

  // Олон хүүхдийг нэг дор бүртгэх (CSV-ээс). Бүгд зөв бол л хадгална (all-or-nothing).
  // dry_run=true бол зөвхөн шалгаж, алдааг мөр, талбараар буцаана.
  const ImportRow = ChildBase.extend({
    elssen_ognoo: date.optional(), hayg: Address.optional(),
    asran: z.object({ hen_boloh: z.enum(ENUM.hen), ovog: reqText(60), ner: reqText(60), utas: phone, ajliin_bair: text(150).optional() }).optional(),
  });
  r.post('/groups/:id/children/import', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    const b = parse(z.object({ dry_run: z.boolean().default(false), rows: z.array(z.unknown()).min(1).max(cfg.IMPORT_MAX_ROWS) }), req.body);
    const errors = [];
    const rows = [];
    b.rows.forEach((raw, i) => {
      const x = ImportRow.safeParse(raw);
      if (x.success) rows.push([i + 1, x.data]);
      else x.error.issues.forEach((is) => errors.push({ mur: i + 1, talbar: is.path.join('.'), aldaa: is.message }));
    });
    const seen = new Map();
    for (const [n, row] of rows) {
      if (!row.registr) continue;
      if (seen.has(row.registr)) errors.push({ mur: n, talbar: 'registr', aldaa: `${seen.get(row.registr)}-р мөртэй ижил РД` });
      else seen.set(row.registr, n);
    }
    const out = await db.tx(req.actor.id, async (c) => {
      await groupFor(c, req.actor, gid, 'write');
      if (seen.size) {
        const ex = await db.q(c, 'SELECT registr FROM suraltsagch WHERE registr IN (?)', [[...seen.keys()]]);
        ex.forEach((e) => errors.push({ mur: seen.get(e.registr), talbar: 'registr', aldaa: 'Энэ РД-тэй хүүхэд системд бүртгэлтэй байна' }));
      }
      if (errors.length) {
        errors.sort((p, q) => p.mur - q.mur);
        throw new HttpError(422, `${new Set(errors.map((e) => e.mur)).size} мөрөнд алдаа байна. Засаад дахин оруулна уу`, 'IMPORT_INVALID', errors);
      }
      if (b.dry_run) return { ok: true, mur_too: rows.length, imported: 0 };
      for (const [, row] of rows) {
        const [x] = await c.query(`INSERT INTO suraltsagch (ovog, ner, registr, torson_ognoo, huis, tanih_temdeg, esis_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [row.ovog, row.ner, row.registr ?? null, row.torson_ognoo, row.huis, row.tanih_temdeg ?? null, row.esis_id ?? null]);
        await c.query('INSERT INTO buleg_gishuun (buleg_id, suraltsagch_id, elssen_ognoo) VALUES (?, ?, COALESCE(?, CURDATE()))', [gid, x.insertId, row.elssen_ognoo ?? null]);
        if (row.hayg) await upsertAddress(c, x.insertId, row.hayg);
        if (row.asran) {
          const [a] = await c.query('INSERT INTO asran_hamgaalagch (ovog, ner, utas, ajliin_bair) VALUES (?, ?, ?, ?)', [row.asran.ovog, row.asran.ner, row.asran.utas, row.asran.ajliin_bair ?? null]);
          await c.query('INSERT INTO suraltsagch_asran (suraltsagch_id, asran_id, hen_boloh, gol_holboo) VALUES (?, ?, ?, TRUE)', [x.insertId, a.insertId, row.asran.hen_boloh]);
        }
      }
      return { ok: true, mur_too: rows.length, imported: rows.length };
    });
    res.status(b.dry_run ? 200 : 201).json(out);
  }));

  // ---------------- Хүүхэд ----------------
  r.get('/children/:id', h(async (req, res) => {
    const { id: cid } = parse(idParam, req.params);
    res.json(await db.run(req.actor.id, async (c) => {
      const { bulegId } = await childFor(c, req.actor, cid);
      const child = await db.one(c, 'SELECT * FROM suraltsagch WHERE suraltsagch_id = ?', [cid]);
      return {
        ...child,
        buleg_id: bulegId,
        hayg: (await db.one(c, 'SELECT duureg, horoo, delgerengui_hayg, toyrgiin_baidal FROM toyrgiin_sudalgaa WHERE suraltsagch_id = ?', [cid])) || null,
        asran_hamgaalagch: await db.q(c, `SELECT a.asran_id, a.ovog, a.ner, a.utas, a.ajliin_bair, sa.hen_boloh, sa.gol_holboo
                                            FROM suraltsagch_asran sa JOIN asran_hamgaalagch a ON a.asran_id = sa.asran_id
                                           WHERE sa.suraltsagch_id = ? ORDER BY sa.gol_holboo DESC`, [cid]),
        eruul_mend: await db.q(c, 'SELECT eruul_id, shinjilgee_ner, hariu, ognoo, havsralt_id FROM eruul_mend WHERE suraltsagch_id = ? ORDER BY ognoo DESC', [cid]),
      };
    }));
  }));

  r.patch('/children/:id', h(async (req, res) => {
    const { id: cid } = parse(idParam, req.params);
    const b = parse(ChildBase.partial(), req.body);
    const fields = Object.keys(b);
    if (!fields.length) throw unprocessable('Өөрчлөх талбар алга');
    await db.run(req.actor.id, async (c) => {
      await childFor(c, req.actor, cid, 'write');
      // Баганын нэр зөвхөн zod-оор шүүгдсэн тогтмол жагсаалтаас
      await c.query(`UPDATE suraltsagch SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE suraltsagch_id = ?`,
        [...fields.map((f) => b[f] ?? null), cid]);
    });
    res.status(204).end();
  }));

  r.put('/children/:id/address', h(async (req, res) => {
    const { id: cid } = parse(idParam, req.params);
    const b = parse(Address, req.body);
    await db.run(req.actor.id, async (c) => { await childFor(c, req.actor, cid, 'write'); await upsertAddress(c, cid, b); });
    res.status(204).end();
  }));

  // Бүлгээс гаргах: шилжсэн, төгссөн
  r.post('/children/:id/leave', h(async (req, res) => {
    const { id: cid } = parse(idParam, req.params);
    const b = parse(z.object({ garsan_ognoo: date, tuluv: z.enum(['Шилжсэн', 'Төгссөн']) }), req.body);
    await db.tx(req.actor.id, async (c) => {
      const { bulegId } = await childFor(c, req.actor, cid, 'write');
      await c.query('UPDATE buleg_gishuun SET garsan_ognoo = ? WHERE buleg_id = ? AND suraltsagch_id = ?', [b.garsan_ognoo, bulegId, cid]);
      await c.query('UPDATE suraltsagch SET tuluv = ? WHERE suraltsagch_id = ?', [b.tuluv, cid]);
    });
    res.status(204).end();
  }));

  // ---------------- Асран хамгаалагч (PR103) ----------------
  // asran_id өгвөл одоо байгаа асран хамгаалагчийг холбоно (зөвхөн хандах эрхтэй хүүхдийнх бол: ах дүүс).
  r.post('/children/:id/guardians', h(async (req, res) => {
    const { id: cid } = parse(idParam, req.params);
    const b = parse(z.object({
      asran_id: id.optional(), ovog: reqText(60).optional(), ner: reqText(60).optional(), utas: phone.optional(),
      ajliin_bair: text(150).optional(), hen_boloh: z.enum(ENUM.hen), gol_holboo: z.boolean().default(false),
    }).refine((v) => v.asran_id || (v.ovog && v.ner && v.utas), { message: 'asran_id эсвэл овог, нэр, утас заавал' }), req.body);
    const out = await db.tx(req.actor.id, async (c) => {
      const { bulegId } = await childFor(c, req.actor, cid, 'write');
      let asranId = b.asran_id;
      if (asranId) {
        const ok = await db.one(c, `SELECT 1 AS ok FROM suraltsagch_asran sa JOIN buleg_gishuun g ON g.suraltsagch_id = sa.suraltsagch_id
                                     WHERE sa.asran_id = ? AND g.buleg_id = ?`, [asranId, bulegId]);
        if (!ok) throw notFound('Асран хамгаалагч олдсонгүй');
      } else {
        const [x] = await c.query('INSERT INTO asran_hamgaalagch (ovog, ner, utas, ajliin_bair) VALUES (?, ?, ?, ?)',
          [b.ovog, b.ner, b.utas, b.ajliin_bair ?? null]);
        asranId = x.insertId;
      }
      if (b.gol_holboo) await c.query('UPDATE suraltsagch_asran SET gol_holboo = FALSE WHERE suraltsagch_id = ?', [cid]);
      await c.query('INSERT INTO suraltsagch_asran (suraltsagch_id, asran_id, hen_boloh, gol_holboo) VALUES (?, ?, ?, ?)',
        [cid, asranId, b.hen_boloh, b.gol_holboo]);
      return { asran_id: asranId };
    });
    res.status(201).json(out);
  }));

  r.patch('/children/:id/guardians/:asranId', h(async (req, res) => {
    const p = parse(z.object({ id, asranId: id }), req.params);
    const b = parse(z.object({ ovog: reqText(60), ner: reqText(60), utas: phone, ajliin_bair: text(150).nullable() }).partial(), req.body);
    const fields = Object.keys(b);
    if (!fields.length) throw unprocessable('Өөрчлөх талбар алга');
    await db.run(req.actor.id, async (c) => {
      await childFor(c, req.actor, p.id, 'write');
      const link = await db.one(c, 'SELECT 1 AS ok FROM suraltsagch_asran WHERE suraltsagch_id = ? AND asran_id = ?', [p.id, p.asranId]);
      if (!link) throw notFound('Асран хамгаалагч олдсонгүй');
      await c.query(`UPDATE asran_hamgaalagch SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE asran_id = ?`,
        [...fields.map((f) => b[f] ?? null), p.asranId]);
    });
    res.status(204).end();
  }));

  // Холбоосыг устгана. Өөр хүүхэдтэй холбоогүй болсон асран хамгаалагчийн мэдээллийг устгана (өгөгдлийг багасгах).
  r.delete('/children/:id/guardians/:asranId', h(async (req, res) => {
    const p = parse(z.object({ id, asranId: id }), req.params);
    await db.tx(req.actor.id, async (c) => {
      await childFor(c, req.actor, p.id, 'write');
      const [x] = await c.query('DELETE FROM suraltsagch_asran WHERE suraltsagch_id = ? AND asran_id = ?', [p.id, p.asranId]);
      if (!x.affectedRows) throw notFound('Асран хамгаалагч олдсонгүй');
      const other = await db.one(c, 'SELECT COUNT(*) AS n FROM suraltsagch_asran WHERE asran_id = ?', [p.asranId]);
      if (other.n === 0) await c.query('DELETE FROM asran_hamgaalagch WHERE asran_id = ?', [p.asranId]);
    });
    res.status(204).end();
  }));

  // ---------------- Эрүүл мэнд (PR106) ----------------
  r.post('/children/:id/health', h(async (req, res) => {
    const { id: cid } = parse(idParam, req.params);
    const b = parse(z.object({ shinjilgee_ner: reqText(120), hariu: reqText(255), ognoo: date }), req.body);
    const [x] = await db.run(req.actor.id, async (c) => {
      await childFor(c, req.actor, cid, 'write');
      return c.query('INSERT INTO eruul_mend (suraltsagch_id, shinjilgee_ner, hariu, ognoo, burtgesen_hereglegch) VALUES (?, ?, ?, ?, ?)',
        [cid, b.shinjilgee_ner, b.hariu, b.ognoo, req.actor.id]);
    });
    res.status(201).json({ eruul_id: x.insertId });
  }));

  r.delete('/health/:id', h(async (req, res) => {
    const { id: eid } = parse(idParam, req.params);
    await db.run(req.actor.id, async (c) => {
      const e = await db.one(c, 'SELECT suraltsagch_id FROM eruul_mend WHERE eruul_id = ?', [eid]);
      if (!e) throw notFound();
      await childFor(c, req.actor, e.suraltsagch_id, 'write');
      await c.query('DELETE FROM eruul_mend WHERE eruul_id = ?', [eid]);
    });
    res.status(204).end();
  }));

  return r;
};
