'use strict';
// Мөрийн түвшний хандалт (өгөгдлийн сан биш, API хэрэгжүүлнэ):
//   bagsh      — өөрийн (эсвэл туслах багшаар ажилладаг) бүлгийг унших, бичих
//   arga_zuich — өөрийн цэцэрлэгийн бүх бүлгийг унших; батлах; хоолны үнэ, асуулт тохируулах
//   admin      — хэрэглэгч, цэцэрлэг, бүлэг удирдана. Хүүхдийн мэдээлэл ХАРАХГҮЙ (хамгийн бага эрх)
// Хандах эрхгүй бүлэг/хүүхдийг "олдсонгүй" гэж хариулна (оршин буйг задруулахгүй).
const { one, q } = require('../db');
const { notFound, forbidden, unprocessable } = require('./errors');

function canRead(actor, g) {
  if (actor.uureg === 'bagsh') return isOwn(actor, g);
  if (actor.uureg === 'arga_zuich') return actor.tsetserlegId != null && g.tsetserleg_id === actor.tsetserlegId;
  return false;
}
function isOwn(actor, g) {
  return actor.bagshId != null && (g.bagsh_id === actor.bagshId || g.tuslah_bagsh_id === actor.bagshId);
}

/** mode: 'read' | 'write' | 'manage' */
async function groupFor(c, actor, bulegId, mode = 'read') {
  const g = await one(c, `SELECT buleg_id, tsetserleg_id, jil_id, bagsh_id, tuslah_bagsh_id, ner, turul, tuvshin
                            FROM buleg WHERE buleg_id = ?`, [bulegId]);
  if (mode === 'manage') {
    if (!g) throw notFound('Бүлэг олдсонгүй');
    if (actor.uureg === 'admin' || (actor.uureg === 'arga_zuich' && g.tsetserleg_id === actor.tsetserlegId)) return g;
    throw forbidden();
  }
  if (!g || !canRead(actor, g)) throw notFound('Бүлэг олдсонгүй');
  if (mode === 'write' && !(actor.uureg === 'bagsh' && isOwn(actor, g))) throw forbidden('Зөвхөн бүлгийн багш өөрчилнө');
  return g;
}

/** Хүүхдийн одоогийн (эсвэл хамгийн сүүлийн) бүлгээр дамжуулан хандалт шалгана */
async function childFor(c, actor, childId, mode = 'read') {
  const rows = await q(c, `
    SELECT g.buleg_id, (g.garsan_ognoo IS NULL OR g.garsan_ognoo >= CURDATE()) AS active
      FROM buleg_gishuun g WHERE g.suraltsagch_id = ?
     ORDER BY active DESC, g.elssen_ognoo DESC`, [childId]);
  for (const r of rows) {
    if (mode === 'write' && !r.active) continue;
    try {
      const g = await groupFor(c, actor, r.buleg_id, mode);
      return { bulegId: r.buleg_id, group: g };
    } catch (e) {
      if (e.status === 403) throw e;
    }
  }
  throw notFound('Хүүхэд олдсонгүй');
}

/** Хүүхдүүд тухайн бүлгийн одоогийн гишүүн эсэхийг шалгана (бөөн оруулалтад) */
async function assertMembers(c, bulegId, childIds) {
  const ids = [...new Set(childIds)];
  if (!ids.length) return;
  const r = await one(c, `SELECT COUNT(DISTINCT suraltsagch_id) AS n FROM buleg_gishuun
                           WHERE buleg_id = ? AND suraltsagch_id IN (?)`, [bulegId, ids]);
  if (r.n !== ids.length) throw unprocessable('Зарим хүүхэд энэ бүлгийн гишүүн биш байна');
}

module.exports = { groupFor, childFor, assertMembers };
