'use strict';
// Интеграцийн тест: бодит MySQL (01–05 SQL ачаалсан), bmms_app эрхтэй хэрэглэгчээр.
//   DB_HOST=... DB_USER=... DB_PASSWORD=... npm test
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
let server; let base;

async function call(method, path, { token, body, cookie, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(cookie ? { cookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, setCookie: res.headers.get('set-cookie') };
}
const cookieOf = (sc) => sc && sc.split(';')[0];
async function login(email, pass = PASS) {
  const r = await call('POST', '/api/v1/auth/login', { body: { nevtreh_ner: email, nuuts_ug: pass } });
  return { ...r, token: r.body && r.body.access_token, cookie: cookieOf(r.setCookie) };
}

before(async () => {
  const { app } = bootstrap();
  const hash = await pw.hashPassword(PASS);
  await db.run(null, async (c) => {
    await c.query('UPDATE hereglegch SET nuuts_ug_hash = ? WHERE hereglegch_id IN (1, 2)', [hash]);
    await c.query("INSERT INTO hereglegch (nevtreh_ner, nuuts_ug_hash, uureg) VALUES ('admin@demo.mn', ?, 'admin')", [hash]);
  });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await db.close(); });

let T; let M; let A;

test('health, нэвтрэлт', async () => {
  assert.equal((await call('GET', '/ready')).status, 200);
  assert.equal((await login('nomin@demo.mn', 'buruu')).status, 401);
  assert.equal((await login('baihgui@demo.mn')).status, 401);
  T = await login('nomin@demo.mn'); M = await login('oyunaa@demo.mn'); A = await login('admin@demo.mn');
  assert.equal(T.status, 200); assert.ok(T.token); assert.match(T.setCookie, /HttpOnly/i); assert.match(T.setCookie, /SameSite=Strict/i);
  const me = await call('GET', '/api/v1/auth/me', { token: T.token });
  assert.equal(me.body.uureg, 'bagsh'); assert.equal(me.body.buleg[0].buleg_id, 1);
  assert.equal((await call('GET', '/api/v1/groups')).status, 401);
  assert.equal((await call('GET', '/api/v1/groups', { token: `${T.token}x` })).status, 401);
});

test('хүүхэд бүртгэх, хандалт', async () => {
  const list = await call('GET', '/api/v1/groups/1/children', { token: T.token });
  assert.equal(list.body.length, 8);
  const bad = await call('POST', '/api/v1/groups/1/children', { token: T.token, body: { ovog: 'А', ner: 'Б', registr: 'AB12345678', torson_ognoo: '2021-02-02', huis: 'Эр' } });
  assert.equal(bad.status, 422);
  const ok = await call('POST', '/api/v1/groups/1/children', { token: T.token,
    body: { ovog: 'Болд', ner: 'Ану', registr: 'жш21020299', torson_ognoo: '2021-02-02', huis: 'Эм', tanih_temdeg: 'Од',
      hayg: { duureg: 'Баянзүрх', horoo: 15, delgerengui_hayg: '5-р байр', toyrgiin_baidal: 'Тойргийн' } } });
  assert.equal(ok.status, 201);
  const ch = await call('GET', `/api/v1/children/${ok.body.suraltsagch_id}`, { token: T.token });
  assert.equal(ch.body.registr, 'ЖШ21020299'); assert.equal(ch.body.hayg.horoo, 15);
  const g = await call('POST', `/api/v1/children/${ok.body.suraltsagch_id}/guardians`, { token: T.token,
    body: { ovog: 'Болд', ner: 'Сараа', utas: '99887766', hen_boloh: 'Ээж', gol_holboo: true } });
  assert.equal(g.status, 201);
  // Арга зүйч уншина, бичихгүй; admin хүүхдийн мэдээлэл харахгүй
  assert.equal((await call('GET', '/api/v1/groups/1/children', { token: M.token })).status, 200);
  assert.equal((await call('PATCH', '/api/v1/children/1', { token: M.token, body: { tanih_temdeg: 'x' } })).status, 403);
  assert.equal((await call('GET', '/api/v1/groups/1/children', { token: A.token })).status, 404);
  assert.equal((await call('GET', '/api/v1/children/1', { token: A.token })).status, 404);
});

test('ирц, нэгтгэл (PR108–109)', async () => {
  const grid = await call('GET', '/api/v1/groups/1/attendance?month=2026-10', { token: T.token });
  assert.equal(grid.body.ajlyn_odor.length, 22);
  const fut = await call('PUT', '/api/v1/groups/1/attendance', { token: T.token, body: { items: [{ suraltsagch_id: 1, ognoo: '2026-12-01', tuluv: 'Ирсэн' }] } });
  assert.equal(fut.status, 422); assert.match(fut.body.error.message, /Ирээдүйн/);
  const upd = await call('PUT', '/api/v1/groups/1/attendance', { token: T.token, body: { items: [{ suraltsagch_id: 1, ognoo: '2026-10-30', tuluv: 'Өвчтэй' }] } });
  assert.equal(upd.body.upserted, 1);
  const wk = await call('POST', '/api/v1/groups/1/attendance/fill', { token: T.token, body: { ognoo: '2026-10-31' } });
  assert.equal(wk.status, 422); assert.match(wk.body.error.message, /Ажлын бус/);
  const sum = await call('GET', '/api/v1/groups/1/attendance/summary?period=month', { token: T.token });
  assert.equal(sum.body.length, 2); assert.equal(sum.body[1].ajillaval_zohih_udur, 22);
  assert.equal((await call('GET', '/api/v1/groups/1/attendance/summary?period=year', { token: M.token })).body[0].jil_id, 1);
});

test('үнэлгээ ба төлөвлөгөөний санал', async () => {
  const s = await call('GET', '/api/v1/groups/1/plan-insight?uye_id=1', { token: T.token });
  assert.ok(s.body.anhaarah_chiglel.some((x) => x.chiglel_id === 2));
  const put = await call('PUT', '/api/v1/groups/1/rubric', { token: T.token, body: { uye_id: 2, items: [{ suraltsagch_id: 1, chiglel_id: 2, tuvshin: 3 }] } });
  assert.equal(put.status, 204);
  const wrong = await call('PUT', '/api/v1/groups/1/rubric', { token: T.token, body: { uye_id: 1, items: [{ suraltsagch_id: 999, chiglel_id: 2, tuvshin: 3 }] } });
  assert.equal(wrong.status, 422);
  const prog = await call('GET', '/api/v1/groups/1/rubric/progress', { token: T.token });
  assert.ok(prog.body.find((x) => x.suraltsagch_id === 1).yavts !== null);
});

test('төлөвлөгөө батлах урсгал (AR101)', async () => {
  const p = await call('POST', '/api/v1/groups/1/plans', { token: T.token, body: { turul: 'Сарын', garchig: '12-р сар: Өвөл', hugatsaa_ehleh: '2026-12-01',
    hugatsaa_duusah: '2026-12-31', ehleh_tuluvluguu_id: 1, zorilgo: 'Өвлийн байгаль', chiglel: [3, 4], alham: ['Ажиглалт', 'Ярилцлага'] } });
  assert.equal(p.status, 201);
  const pid = p.body.tuluvluguu_id;
  const badParent = await call('POST', '/api/v1/groups/1/plans', { token: T.token, body: { turul: 'Жилийн', garchig: 'x', hugatsaa_ehleh: '2026-09-01', hugatsaa_duusah: '2027-05-31', ehleh_tuluvluguu_id: pid } });
  assert.equal(badParent.status, 422);
  assert.equal((await call('POST', `/api/v1/plans/${pid}/transition`, { token: T.token, body: { to: 'Хянагдаж буй' } })).status, 204);
  assert.equal((await call('POST', `/api/v1/plans/${pid}/transition`, { token: T.token, body: { to: 'Батлагдсан' } })).status, 422);
  const q = await call('GET', '/api/v1/approvals', { token: M.token });
  assert.ok(q.body.some((x) => x.obekt === 'tuluvluguu' && x.id === pid));
  assert.equal((await call('POST', `/api/v1/plans/${pid}/transition`, { token: M.token, body: { to: 'Буцаасан' } })).status, 422);
  assert.equal((await call('POST', `/api/v1/plans/${pid}/transition`, { token: M.token, body: { to: 'Буцаасан', tekst: 'Зорилгыг тодруулна уу' } })).status, 204);
  assert.equal((await call('PATCH', `/api/v1/plans/${pid}`, { token: T.token, body: { zorilgo: 'Тодруулсан зорилго' } })).status, 204);
  assert.equal((await call('POST', `/api/v1/plans/${pid}/transition`, { token: T.token, body: { to: 'Хянагдаж буй' } })).status, 204);
  assert.equal((await call('POST', `/api/v1/plans/${pid}/transition`, { token: M.token, body: { to: 'Батлагдсан' } })).status, 204);
  assert.equal((await call('PATCH', `/api/v1/plans/${pid}`, { token: T.token, body: { zorilgo: 'x' } })).status, 409);
  const d = await call('GET', `/api/v1/plans/${pid}`, { token: T.token });
  assert.equal(d.body.tuluv, 'Батлагдсан'); assert.deepEqual(d.body.chiglel, [3, 4]); assert.deepEqual(d.body.sanal_shuumj.map((x) => x.uildel), ["Илгээв", "Буцаав", "Илгээв", "Батлав"]);
  const rep = await call('GET', '/api/v1/reports/1', { token: M.token });
  assert.equal(rep.body.sar, '2026-10'); assert.ok(rep.body.statistik.irts.guitsetgel > 0); assert.equal(rep.body.statistik.uil_ajillagaa.length, 1);
});

test('ганцаарчилсан сургалт: шифрлэлт, аудит (SR107)', async () => {
  const cr = await call('POST', '/api/v1/groups/1/individual', { token: T.token,
    body: { suraltsagch_id: 3, onosh: 'Хэл ярианы хоцрогдол', ehlel_ajiglalt: 'Үг цөөн', ehelsen_ognoo: '2026-10-01' } });
  assert.equal(cr.status, 201);
  const sid = cr.body.surgalt_id;
  assert.equal((await call('POST', `/api/v1/individual/${sid}/reports`, { token: T.token, body: { sar: '2026-10', tailan: 'Ахиц ажиглагдсан' } })).status, 201);
  const g = await call('GET', `/api/v1/individual/${sid}`, { token: M.token });
  assert.equal(g.body.onosh, 'Хэл ярианы хоцрогдол'); assert.equal(g.body.sar_tailan[0].tailan, 'Ахиц ажиглагдсан');
  const raw = await db.run(null, (c) => db.one(c, 'SELECT onosh_enc FROM gantsaarchilsan_surgalt WHERE surgalt_id = ?', [sid]));
  assert.ok(!raw.onosh_enc.toString('utf8').includes('Хэл'));
  // Шифрлэгдсэн утгыг өөр хүүхдийн мөрөнд хуулбал тайлагдахгүй (AAD)
  const other = await call('POST', '/api/v1/groups/1/individual', { token: T.token, body: { suraltsagch_id: 4, onosh: 'x', ehelsen_ognoo: '2026-10-01' } });
  await db.run(null, (c) => c.query('UPDATE gantsaarchilsan_surgalt SET onosh_enc = ? WHERE surgalt_id = ?', [raw.onosh_enc, other.body.surgalt_id]));
  const tampered = await call('GET', `/api/v1/individual/${other.body.surgalt_id}`, { token: T.token });
  assert.equal(tampered.status, 500); assert.equal(tampered.body.error.code, 'INTEGRITY');
  assert.equal((await call('GET', `/api/v1/individual/${sid}`, { token: A.token })).status, 404);
});

test('refresh token ээлжлэх, дахин ашиглахыг илрүүлэх', async () => {
  const L = await login('nomin@demo.mn');
  const noHdr = await call('POST', '/api/v1/auth/refresh', { cookie: L.cookie });
  assert.equal(noHdr.status, 400);
  const r1 = await call('POST', '/api/v1/auth/refresh', { cookie: L.cookie, headers: { 'x-requested-with': 'bmms' } });
  assert.equal(r1.status, 200);
  const newCookie = cookieOf(r1.setCookie);
  const reuse = await call('POST', '/api/v1/auth/refresh', { cookie: L.cookie, headers: { 'x-requested-with': 'bmms' } });
  assert.equal(reuse.status, 401);
  // Хуучин токен дахин ирсэн тул шинэ токен ч цуцлагдсан байх ёстой
  assert.equal((await call('POST', '/api/v1/auth/refresh', { cookie: newCookie, headers: { 'x-requested-with': 'bmms' } })).status, 401);
});

test('admin: хэрэглэгч үүсгэх, түгжих, эрх', async () => {
  const weak = await call('POST', '/api/v1/admin/users', { token: A.token, body: { nevtreh_ner: 'tuya@demo.mn', nuuts_ug: 'short', uureg: 'bagsh',
    profile: { tsetserleg_id: 1, ovog: 'Бат', ner: 'Туяа', alban_tushaal: 'Бүлгийн багш' } } });
  assert.equal(weak.status, 422);
  const u = await call('POST', '/api/v1/admin/users', { token: A.token, body: { nevtreh_ner: 'tuya@demo.mn', nuuts_ug: PASS, uureg: 'bagsh',
    profile: { tsetserleg_id: 1, ovog: 'Бат', ner: 'Туяа', alban_tushaal: 'Бүлгийн багш' } } });
  assert.equal(u.status, 201);
  // Өмнөх тестэд refresh token дахин ашиглагдсан тул T-ийн access token ч хүчингүй болсон байх ёстой
  assert.equal((await call('GET', '/api/v1/auth/me', { token: T.token })).status, 401);
  T = await login('nomin@demo.mn');
  assert.equal((await call('POST', '/api/v1/admin/users', { token: T.token, body: {} })).status, 403);
  let T2 = await login('tuya@demo.mn');
  const forced = await call('GET', '/api/v1/groups/1/children', { token: T2.token });
  assert.equal(forced.status, 403); assert.equal(forced.body.error.code, 'PASSWORD_CHANGE_REQUIRED'); // түр нууц үг
  assert.equal((await call('POST', '/api/v1/auth/change-password', { token: T2.token, body: { huuchin: PASS, shine: 'Shine!Nuuts-2026' } })).status, 204);
  T2 = await login('tuya@demo.mn', 'Shine!Nuuts-2026');
  assert.equal((await call('GET', '/api/v1/groups/1/children', { token: T2.token })).status, 404); // өөр багшийн бүлэг
  for (let i = 0; i < 5; i++) await login('tuya@demo.mn', 'Buruu-pass-123');
  assert.equal((await login('tuya@demo.mn', 'Shine!Nuuts-2026')).status, 401); // түгжигдсэн
  // Admin идэвхгүй болгоход хүчинтэй access token ч тэр даруй ажиллахаа больно
  await call('PATCH', `/api/v1/admin/users/${u.body.hereglegch_id}`, { token: A.token, body: { tuluv: 'idevhgui' } });
  assert.equal((await call('GET', '/api/v1/auth/me', { token: T2.token })).status, 401);
  const audits = await db.run(null, (c) => db.q(c, "SELECT 1 FROM audit_log WHERE uildel IN ('LOGIN_FAIL') LIMIT 1").catch((e) => e));
  assert.ok(audits instanceof Error && audits.errno === 1142, 'bmms_app нь audit_log унших эрхгүй байх ёстой');
});
