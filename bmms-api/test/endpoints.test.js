'use strict';
// Бусад endpoint-ийн утгын шалгалт (05_demo_data ачаалсан шинэ DB дээр api.test.js-ийн дараа ажиллана).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= crypto.randomBytes(32).toString('hex');
process.env.COOKIE_SECURE = 'false';
process.env.LOGIN_RATE_LIMIT = '200';
process.env.LOG_LEVEL = 'silent';
process.env.MAIL_PROVIDER = 'memory';
process.env.MFA_REQUIRED_ROLES = ''; // MFA-г security.test.js тусад нь шалгана
process.env.MFA_PEPPER ||= 'test-only-pepper-0123456789abcdef0123';
// Тестийн файлууд тусдаа процесс тул ижил (зөвхөн тестийн) түлхүүр ашиглана
process.env.FIELD_KEYS ||= JSON.stringify({ ktest: Buffer.alloc(32, 7).toString('base64') });
process.env.FIELD_KEY_ACTIVE ||= 'ktest';

const { bootstrap } = require('../src/server');
const db = require('../src/db');
const pw = require('../src/security/password');

const PASS = 'Tur$hilt-2026-pass';
let server; let base; let T; let M;

async function call(method, path, token, body) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await res.text();
  return { status: res.status, body: t ? JSON.parse(t) : null };
}
async function login(email) {
  const res = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nevtreh_ner: email, nuuts_ug: PASS }) });
  return (await res.json()).access_token;
}

before(async () => {
  const { app } = bootstrap();
  const hash = await pw.hashPassword(PASS);
  await db.run(null, (c) => c.query('UPDATE hereglegch SET nuuts_ug_hash = ?, tuluv = "idevhtei", tugjigdsen_hurtel = NULL WHERE hereglegch_id IN (1, 2)', [hash]));
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  T = await login('nomin@demo.mn'); M = await login('oyunaa@demo.mn');
});
after(async () => { server.close(); await db.close(); });

test('фонт, kinder police, өсөлт', async () => {
  const f = await call('GET', '/api/v1/groups/1/fees', T);
  assert.equal(f.status, 200); assert.ok(f.body.khuraamj.length >= 16);
  assert.equal((await call('PUT', '/api/v1/groups/1/fees', T, { items: [{ suraltsagch_id: 3, sar: '2026-10', tuluv: 'Төлсөн', dun: 30000 }] })).status, 204);
  assert.equal((await call('PUT', '/api/v1/groups/1/fees', T, { items: [{ suraltsagch_id: 9999, sar: '2026-10', tuluv: 'Төлсөн' }] })).status, 422);
  const kp = await call('POST', '/api/v1/children/1/kinder-police', T, { asran_id: 1, ehleh_tsag: '2026-11-12T07:45' });
  assert.equal(kp.status, 201);
  assert.equal((await call('POST', '/api/v1/children/1/kinder-police', T, { asran_id: 5, ehleh_tsag: '2026-11-12T07:45' })).status, 422);
  assert.ok((await call('GET', '/api/v1/groups/1/kinder-police?from=2026-11-01', M)).body.length >= 3);
  assert.equal((await call('DELETE', `/api/v1/kinder-police/${kp.body.kp_id}`, T)).status, 204);
  assert.equal((await call('PUT', '/api/v1/children/2/growth', T, { hemjilt_on: 2027, uliral: 'Хавар', hemjsen_ognoo: '2026-10-30', jin: 21.5, undur: 118, unelgee: 'Хэвийн' })).status, 204);
  assert.equal((await call('PUT', '/api/v1/children/2/growth', T, { hemjilt_on: 2027, uliral: 'Хавар', hemjsen_ognoo: '2026-10-30', jin: 22, undur: 119 })).status, 204);
  const g = await call('GET', '/api/v1/groups/1/growth?on=2027', T);
  assert.equal(g.body.hemjilt.length, 1); assert.equal(g.body.hemjilt[0].jin, 22); assert.ok(g.body.hemjilt[0].bji > 15);
});

test('анги танхим, хяналтын хуудас, өөрийн үнэлгээ', async () => {
  const m = await call('POST', '/api/v1/groups/1/materials', T, { ner: 'Шатар', angilal: 'Тоглоом', too_shirheg: 3 });
  assert.equal(m.status, 201);
  assert.equal((await call('PATCH', `/api/v1/materials/${m.body.heregsel_id}`, T, { too_shirheg: 4 })).status, 204);
  assert.equal((await call('PATCH', `/api/v1/materials/${m.body.heregsel_id}`, M, { too_shirheg: 9 })).status, 403);
  assert.equal((await call('DELETE', `/api/v1/materials/${m.body.heregsel_id}`, T)).status, 204);
  const s = await call('GET', '/api/v1/groups/1/supplies', T);
  assert.equal(s.body.turul.length, 5);
  assert.equal((await call('PUT', '/api/v1/groups/1/supplies', T, { items: [{ suraltsagch_id: 1, turul_id: 1, too: 3 }] })).status, 204);
  const st = await call('POST', '/api/v1/groups/1/supply-types', T, { ner: 'Цавуу' });
  assert.equal((await call('DELETE', `/api/v1/supply-types/${st.body.turul_id}`, T)).status, 204);
  assert.equal((await call('PUT', '/api/v1/groups/1/checklist', T, { uye_id: 1, items: [{ suraltsagch_id: 1, asuult_id: 4, chaddag: true }] })).status, 204);
  assert.ok((await call('GET', '/api/v1/groups/1/checklist?uye_id=1', T)).body.length >= 144);
  assert.equal((await call('GET', '/api/v1/groups/1/checklist/summary?uye_id=1', M)).body.length, 18);
  assert.equal((await call('PUT', '/api/v1/self-eval', T, { uye_id: 1, items: [{ shalguur_id: 5, onoo: 2 }] })).status, 204);
  assert.equal((await call('GET', '/api/v1/self-eval?uye_id=1', T)).body.length, 18);
  assert.equal((await call('GET', '/api/v1/reference', T)).body.hyanaltyn_asuult.length, 18);
});

test('тохиргоо: хоолны үнэ, амралт, асуулт, тайлан, төлөвлөгөөний жагсаалт', async () => {
  assert.equal((await call('POST', '/api/v1/kindergartens/1/meal-prices', M, { hugatsaa_ehleh: '2026-12-01', neg_odriin_une: 5000 })).status, 201);
  assert.equal((await call('POST', '/api/v1/kindergartens/1/meal-prices', T, { hugatsaa_ehleh: '2026-12-02', neg_odriin_une: 1 })).status, 403);
  const hday = await call('POST', '/api/v1/holidays', M, { ognoo: '2026-11-26', ner: 'Цэцэрлэгийн арга хэмжээ' });
  assert.equal(hday.status, 201);
  assert.equal((await call('GET', '/api/v1/groups/1/attendance?month=2026-11', T)).body.ajlyn_odor.length, 20);
  assert.equal((await call('DELETE', `/api/v1/holidays/${hday.body.amralt_id}`, M)).status, 204);
  const q = await call('POST', '/api/v1/checklist-items', M, { chiglel_id: 1, asuult: 'Шүлэг цээжилдэг үү?', daraalal: 19 });
  assert.equal(q.status, 201);
  assert.equal((await call('PATCH', `/api/v1/checklist-items/${q.body.asuult_id}`, M, { idevhtei: false })).status, 204);
  assert.ok((await call('GET', '/api/v1/groups/1/plans?turul=Сарын', T)).body.every((p) => p.turul === 'Сарын'));
  assert.ok((await call('GET', '/api/v1/groups/1/reports', M)).body[0].guitsetgel_huvi > 0);
  const rp = await call('POST', '/api/v1/groups/1/reports', T, { sar: '2026-09', hiigdsen_ajil: 'Дасан зохицох үе' });
  assert.equal(rp.status, 201);
  assert.equal((await call('POST', `/api/v1/reports/${rp.body.tailan_id}/comments`, M, { tekst: 'Зураг хавсаргана уу' })).status, 201);
  assert.equal((await call('DELETE', `/api/v1/reports/${rp.body.tailan_id}`, T)).status, 204);
  assert.equal((await call('GET', '/api/v1/school-years/1/periods', T)).body.length, 3);
  assert.equal((await call('GET', '/api/v1/kindergartens', T)).status, 200);
});

test('асран хамгаалагч, эрүүл мэнд, бүлгээс гаргах', async () => {
  const g = await call('POST', '/api/v1/children/6/guardians', T, { asran_id: 1, hen_boloh: 'Эгч' });
  assert.equal(g.status, 409); // аль хэдийн холбогдсон
  assert.equal((await call('PATCH', '/api/v1/children/1/guardians/1', T, { utas: '99001999' })).status, 204);
  const n = await call('POST', '/api/v1/children/2/guardians', T, { ovog: 'Төмөр', ner: 'Бат', utas: '88112233', hen_boloh: 'Аав' });
  assert.equal((await call('DELETE', `/api/v1/children/2/guardians/${n.body.asran_id}`, T)).status, 204);
  const hl = await call('POST', '/api/v1/children/2/health', T, { shinjilgee_ner: 'Шүдний үзлэг', hariu: 'Хэвийн', ognoo: '2026-10-20' });
  assert.equal((await call('DELETE', `/api/v1/health/${hl.body.eruul_id}`, T)).status, 204);
  assert.equal((await call('POST', '/api/v1/children/8/leave', T, { garsan_ognoo: '2026-10-31', tuluv: 'Шилжсэн' })).status, 204);
  assert.equal((await call('PATCH', '/api/v1/children/8', T, { tanih_temdeg: 'Шинэ' })).status, 204); // 10-31 хүртэл гишүүн
  const kids = await call('GET', '/api/v1/groups/1/children', T);
  assert.ok(kids.body[0].registr && 'suuliin_shinjilgee' in kids.body[0] && 'duureg' in kids.body[0]);
  assert.ok((await call('GET', '/api/v1/teachers', M)).body.length >= 2);
  assert.equal((await call('GET', '/api/v1/teachers', T)).status, 403);
  assert.equal((await call('PATCH', '/api/v1/auth/me', T, { utas: '99110009' })).status, 204);
  assert.equal((await call('PATCH', '/api/v1/auth/me', T, { utas: '12' })).status, 422);
  const list = await call('GET', '/api/v1/groups', M);
  assert.equal(list.body[0].huuhdiin_too, 9);
  const ind = await call('GET', '/api/v1/groups/1/individual', M);
  assert.equal(ind.status, 200);
  assert.equal(ind.body.filter((x) => x.buren_butein_aldagdsan).length, 1); // api.test-д санаатай эвдэлсэн бичлэг
  assert.equal(ind.body.find((x) => x.suraltsagch_id === 3).onosh, 'Хэл ярианы хоцрогдол');
});
