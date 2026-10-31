'use strict';
// Ганцаарчилсан сургалт (PR117, IR106, SR107).
// Онош, ажиглалт, зорилт, сарын тайланг AES-256-GCM-ээр шифрлэнэ. Унших бүрийг audit_log-д READ гэж бүртгэнэ.
const express = require('express');
const db = require('../db');
const fc = require('../security/fieldCrypto');
const { groupFor, childFor } = require('../middleware/access');
const { audit } = require('../middleware/auth');
const { h, notFound, unprocessable, HttpError } = require('../middleware/errors');
const { z, parse, id, date, month, monthStart, text, reqText, idParam } = require('../middleware/validate');

const aad = (col, childId) => `gantsaarchilsan_surgalt.${col}:${childId}`;
const aadReport = (surgaltId, sar) => `gantsaarchilsan_tailan:${surgaltId}:${sar}`;

function decryptRow(row) {
  const d = (col) => {
    try { return fc.decrypt(row[`${col}_enc`], row.key_id, aad(col, row.suraltsagch_id)); } catch (e) {
      // GCM tag таарахгүй: өгөгдөл өөрчлөгдсөн, буруу мөрөнд хуулагдсан, эсвэл түлхүүр алга
      throw new HttpError(500, 'Шифрлэгдсэн өгөгдлийн бүрэн бүтэн байдал алдагдсан', 'INTEGRITY', { surgalt_id: row.surgalt_id });
    }
  };
  return {
    surgalt_id: row.surgalt_id, suraltsagch_id: row.suraltsagch_id, buleg_id: row.buleg_id,
    ovog: row.ovog, ner: row.ner, ehelsen_ognoo: row.ehelsen_ognoo, duussan_ognoo: row.duussan_ognoo,
    onosh: d('onosh'), ehlel_ajiglalt: d('ehlel_ajiglalt'), zorilt: d('zorilt'),
  };
}

async function loadRecord(c, actor, sid, mode) {
  const row = await db.one(c, `SELECT g.*, s.ovog, s.ner FROM gantsaarchilsan_surgalt g
                                 JOIN suraltsagch s ON s.suraltsagch_id = g.suraltsagch_id WHERE g.surgalt_id = ?`, [sid]);
  if (!row) throw notFound();
  try { await groupFor(c, actor, row.buleg_id, mode); } catch (e) { if (e.status === 404) throw notFound(); throw e; }
  return row;
}

const Body = z.object({ onosh: reqText(3000), ehlel_ajiglalt: text(12000).nullable().optional(), zorilt: text(12000).nullable().optional(),
  ehelsen_ognoo: date, duussan_ognoo: date.nullable().optional() });

module.exports = () => {
  const r = express.Router();

  r.get('/groups/:id/individual', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    res.json(await db.run(req.actor.id, async (c) => {
      await groupFor(c, req.actor, gid);
      const rows = await db.q(c, `SELECT g.*, s.ovog, s.ner FROM gantsaarchilsan_surgalt g
                                    JOIN suraltsagch s ON s.suraltsagch_id = g.suraltsagch_id WHERE g.buleg_id = ? ORDER BY s.ner`, [gid]);
      if (rows.length) {
        await audit(c, { userId: req.actor.id, uildel: 'READ', husnegt: 'gantsaarchilsan_surgalt', ip: req.ip,
          detail: { buleg_id: gid, ids: rows.map((x) => x.surgalt_id) } });
      }
      // Нэг бичлэг эвдэрсэн ч бусдыг харуулна; эвдэрсэнг тэмдэглэж, аюулгүй байдлын лог руу бичнэ
      return rows.map((row) => {
        try { return decryptRow(row); } catch (e) {
          req.log.warn({ surgalt_id: row.surgalt_id }, 'field decryption integrity failure');
          return { surgalt_id: row.surgalt_id, suraltsagch_id: row.suraltsagch_id, ovog: row.ovog, ner: row.ner, buren_butein_aldagdsan: true };
        }
      });
    }));
  }));

  r.post('/groups/:id/individual', h(async (req, res) => {
    const { id: gid } = parse(idParam, req.params);
    const b = parse(Body.extend({ suraltsagch_id: id }), req.body);
    const [x] = await db.run(req.actor.id, async (c) => {
      await groupFor(c, req.actor, gid, 'write');
      const { bulegId } = await childFor(c, req.actor, b.suraltsagch_id, 'write');
      if (bulegId !== gid) throw unprocessable('Хүүхэд энэ бүлгийн гишүүн биш байна');
      return c.query(`INSERT INTO gantsaarchilsan_surgalt (suraltsagch_id, buleg_id, onosh_enc, ehlel_ajiglalt_enc, zorilt_enc, key_id, ehelsen_ognoo, duussan_ognoo)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [b.suraltsagch_id, gid, fc.encrypt(b.onosh, aad('onosh', b.suraltsagch_id)),
        fc.encrypt(b.ehlel_ajiglalt, aad('ehlel_ajiglalt', b.suraltsagch_id)), fc.encrypt(b.zorilt, aad('zorilt', b.suraltsagch_id)),
        fc.activeKeyId(), b.ehelsen_ognoo, b.duussan_ognoo ?? null]);
    });
    res.status(201).json({ surgalt_id: x.insertId });
  }));

  r.get('/individual/:id', h(async (req, res) => {
    const { id: sid } = parse(idParam, req.params);
    res.json(await db.run(req.actor.id, async (c) => {
      const row = await loadRecord(c, req.actor, sid, 'read');
      const reps = await db.q(c, "SELECT tailan_id, DATE_FORMAT(sar, '%Y-%m') AS sar, tailan_enc, key_id, created_at FROM gantsaarchilsan_tailan WHERE surgalt_id = ? ORDER BY sar", [sid]);
      await audit(c, { userId: req.actor.id, uildel: 'READ', husnegt: 'gantsaarchilsan_surgalt', id: sid, ip: req.ip });
      return {
        ...decryptRow(row),
        sar_tailan: reps.map((t) => {
          try {
            return { tailan_id: t.tailan_id, sar: t.sar, created_at: t.created_at, tailan: fc.decrypt(t.tailan_enc, t.key_id, aadReport(sid, t.sar)) };
          } catch { throw new HttpError(500, 'Шифрлэгдсэн өгөгдлийн бүрэн бүтэн байдал алдагдсан', 'INTEGRITY', { tailan_id: t.tailan_id }); }
        }),
      };
    }));
  }));

  // Засахад бүх талбарыг идэвхтэй түлхүүрээр дахин шифрлэнэ (түлхүүр солих ажлыг давхар гүйцэтгэнэ)
  r.put('/individual/:id', h(async (req, res) => {
    const { id: sid } = parse(idParam, req.params);
    const b = parse(Body, req.body);
    await db.run(req.actor.id, async (c) => {
      const row = await loadRecord(c, req.actor, sid, 'write');
      const cid = row.suraltsagch_id;
      await c.query(`UPDATE gantsaarchilsan_surgalt SET onosh_enc = ?, ehlel_ajiglalt_enc = ?, zorilt_enc = ?, key_id = ?,
                       ehelsen_ognoo = ?, duussan_ognoo = ? WHERE surgalt_id = ?`,
      [fc.encrypt(b.onosh, aad('onosh', cid)), fc.encrypt(b.ehlel_ajiglalt, aad('ehlel_ajiglalt', cid)),
        fc.encrypt(b.zorilt, aad('zorilt', cid)), fc.activeKeyId(), b.ehelsen_ognoo, b.duussan_ognoo ?? null, sid]);
    });
    res.status(204).end();
  }));

  r.post('/individual/:id/reports', h(async (req, res) => {
    const { id: sid } = parse(idParam, req.params);
    const b = parse(z.object({ sar: month, tailan: reqText(12000) }), req.body);
    const [x] = await db.run(req.actor.id, async (c) => {
      await loadRecord(c, req.actor, sid, 'write');
      return c.query(`INSERT INTO gantsaarchilsan_tailan (surgalt_id, sar, tailan_enc, key_id, burtgesen_hereglegch) VALUES (?, ?, ?, ?, ?)`,
        [sid, monthStart(b.sar), fc.encrypt(b.tailan, aadReport(sid, b.sar)), fc.activeKeyId(), req.actor.id]);
    });
    res.status(201).json({ tailan_id: x.insertId });
  }));

  r.delete('/individual/:id', h(async (req, res) => {
    const { id: sid } = parse(idParam, req.params);
    await db.run(req.actor.id, async (c) => {
      await loadRecord(c, req.actor, sid, 'write');
      await c.query('DELETE FROM gantsaarchilsan_surgalt WHERE surgalt_id = ?', [sid]);
    });
    res.status(204).end();
  }));

  return r;
};
