'use strict';
// MFA, анх нэвтрэхэд нууц үг солиулах, CSV оруулах, хадгалалтын хугацаа, migration-ий SQL задлагч.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= crypto.randomBytes(32).toString('hex');
process.env.COOKIE_SECURE = 'false';
process.env.LOGIN_RATE_LIMIT = '200';
process.env.LOG_LEVEL = 'silent';
process.env.MAIL_PROVIDER = 'memory';
process.env.MFA_REQUIRED_ROLES = 'arga_zuich';
process.env.MFA_PEPPER ||= 'test-only-pepper-0123456789abcdef0123';
process.env.FIELD_KEYS ||= JSON.stringify({ ktest: Buffer.alloc(32, 7).toString('base64') });
process.env.FIELD_KEY_ACTIVE ||= 'ktest';

const { bootstrap } = require('../src/server');
const db = require('../src/db');
const pw = require('../src/security/password');
const totp = require('../src/security/totp');
const { splitSql } = require('../scripts/migrate');

const PASS = 'Tur$hilt-2026-pass';
let server; let base;
async function call(method, p, token, body) {
  const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await res.text();
  return { status: res.status, body: t ? JSON.parse(t) : null };
}
const login = (email, pass = PASS) => call('POST', '/api/v1/auth/login', null, { nevtreh_ner: email, nuuts_ug: pass });
const codeAt = (b32, offset = 0) => totp.hotp(totp.base32Decode(b32), totp.stepAt() + offset);

before(async () => {
  const { app } = bootstrap();
  const hash = await pw.hashPassword(PASS);
  await db.run(null, (c) => c.query("UPDATE hereglegch SET nuuts_ug_hash = ?, tuluv = 'idevhtei', tugjigdsen_hurtel = NULL, amjiltgui_oroldlogo = 0 WHERE nevtreh_ner IN ('nomin@demo.mn', 'oyunaa@demo.mn', 'admin@demo.mn')", [hash]));
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await db.close(); });

test('SQL задлагч: DELIMITER, хашилт, тайлбар', () => {
  const s = splitSql("SET a = 'x;y'; -- comment; here\nINSERT INTO t VALUES ('it''s;', \"q;\");\n/* block; */\nDELIMITER $$\nCREATE PROCEDURE p() BEGIN SELECT 1; SELECT 2; END$$\nDELIMITER ;\nSELECT 3;");
  assert.equal(s.length, 4);
  assert.match(s[2], /BEGIN SELECT 1; SELECT 2; END$/);
});

let M; let secret;
test('арга зүйч: MFA заавал, тохируулах, нөөц код', async () => {
  const l = await login('oyunaa@demo.mn');
  assert.equal(l.status, 200); M = l.body.access_token;
  const blocked = await call('GET', '/api/v1/groups', M);
  assert.equal(blocked.status, 403); assert.equal(blocked.body.error.code, 'MFA_SETUP_REQUIRED');
  assert.equal((await call('GET', '/api/v1/auth/me', M)).body.hyazgaarlalt, 'mfa_setup');
  const setup = await call('POST', '/api/v1/auth/mfa/setup', M);
  assert.equal(setup.status, 200); assert.match(setup.body.otpauth_uri, /^otpauth:\/\/totp\/BMMS/);
  secret = setup.body.tulhuur;
  assert.equal((await call('POST', '/api/v1/auth/mfa/activate', M, { kod: '000000' })).status, 401);
  const actCode = codeAt(secret);
  const act = await call('POST', '/api/v1/auth/mfa/activate', M, { kod: actCode });
  assert.equal(act.status, 200); assert.equal(act.body.noots_kod.length, 10);
  assert.equal((await call('GET', '/api/v1/groups', M)).status, 200);
  assert.equal((await call('POST', '/api/v1/auth/mfa/disable', M, { kod: codeAt(secret, 1) })).status, 403); // үүрэгт заавал
  const raw = await db.run(null, (c) => db.one(c, "SELECT mfa_secret_enc FROM hereglegch WHERE nevtreh_ner = 'oyunaa@demo.mn'"));
  assert.ok(!raw.mfa_secret_enc.toString('latin1').includes(secret)); // нууц шифрлэгдсэн

  // Дахин нэвтрэх: нууц үгийн дараа MFA шаардана
  const s1 = await login('oyunaa@demo.mn');
  assert.equal(s1.body.mfa_required, true); assert.equal(s1.body.access_token, undefined);
  const replay = await call('POST', '/api/v1/auth/mfa/verify', null, { mfa_token: s1.body.mfa_token, kod: actCode });
  assert.equal(replay.status, 401); // идэвхжүүлэхэд ашигласан кодыг дахин ашиглахгүй
  const rc = act.body.noots_kod[0];
  assert.equal((await call('POST', '/api/v1/auth/mfa/verify', null, { mfa_token: s1.body.mfa_token, kod: rc.toLowerCase() })).status, 200);
  assert.equal((await call('POST', '/api/v1/auth/mfa/verify', null, { mfa_token: s1.body.mfa_token, kod: rc })).status, 401); // нэг удаагийн
  const ok = await call('POST', '/api/v1/auth/mfa/verify', null, { mfa_token: s1.body.mfa_token, kod: codeAt(secret, 1) });
  assert.equal(ok.status, 200); assert.ok(ok.body.access_token);
  assert.equal((await call('POST', '/api/v1/auth/mfa/verify', null, { mfa_token: 'x', kod: '123456' })).status, 401);
  // Access token-оор MFA алхмыг алгасах боломжгүй (audience өөр)
  assert.equal((await call('POST', '/api/v1/auth/mfa/verify', null, { mfa_token: ok.body.access_token, kod: '123456' })).status, 401);
});

test('MFA кодыг таах оролдлого түгжинэ, admin тэглэнэ', async () => {
  const s = await login('oyunaa@demo.mn');
  for (let i = 0; i < 5; i++) await call('POST', '/api/v1/auth/mfa/verify', null, { mfa_token: s.body.mfa_token, kod: '111111' });
  assert.equal((await call('POST', '/api/v1/auth/mfa/verify', null, { mfa_token: s.body.mfa_token, kod: codeAt(secret, 1) })).status, 401);
  assert.equal((await login('oyunaa@demo.mn')).status, 401); // нууц үгээр ч түгжигдсэн
  const A = (await login('admin@demo.mn')).body.access_token; // admin-д энэ тестэд MFA заавал биш
  const users = await call('GET', '/api/v1/admin/users', A);
  const m = users.body.find((u) => u.nevtreh_ner === 'oyunaa@demo.mn');
  assert.equal(m.mfa_idevhtei, 1);
  // Утсаа алдсан: admin MFA-г тэглэж, түр нууц үг өгнө → дараагийн нэвтрэлтэд нууц үг солиод MFA дахин тохируулна
  assert.equal((await call('PATCH', `/api/v1/admin/users/${m.hereglegch_id}`, A, { mfa_reset: true, nuuts_ug: 'Tur-nuuts-2026!x' })).status, 204);
  const l = await login('oyunaa@demo.mn', 'Tur-nuuts-2026!x');
  assert.equal(l.status, 200); assert.ok(l.body.access_token);
  const me = await call('GET', '/api/v1/auth/me', l.body.access_token);
  assert.equal(me.body.hyazgaarlalt, 'password'); assert.equal(me.body.mfa_idevhtei, false);
  assert.equal((await call('POST', '/api/v1/auth/mfa/setup', l.body.access_token)).status, 403); // эхлээд нууц үг
});

test('багш: MFA сайн дураар идэвхжүүлж, унтраах', async () => {
  const T = (await login('nomin@demo.mn')).body.access_token;
  assert.equal((await call('GET', '/api/v1/groups', T)).status, 200);
  const s = await call('POST', '/api/v1/auth/mfa/setup', T);
  assert.equal((await call('POST', '/api/v1/auth/mfa/activate', T, { kod: codeAt(s.body.tulhuur) })).status, 200);
  assert.equal((await call('POST', '/api/v1/auth/mfa/recovery-codes', T, { kod: codeAt(s.body.tulhuur, 1) })).body.noots_kod.length, 10);
  assert.equal((await login('nomin@demo.mn')).body.mfa_required, true);
  assert.equal((await call('POST', '/api/v1/auth/mfa/disable', T, { kod: codeAt(s.body.tulhuur, -1) })).status, 401); // хуучин алхам
  await new Promise((r) => { setTimeout(r, Math.max(0, 30000 - (Date.now() % 30000)) + 200); }); // дараагийн 30 сек алхам
  assert.equal((await call('POST', '/api/v1/auth/mfa/disable', T, { kod: codeAt(s.body.tulhuur, 1) })).status, 204);
  assert.ok((await login('nomin@demo.mn')).body.access_token);
});

test('CSV оруулах: шалгах, бүгд эсвэл юу ч үгүй', async () => {
  const T = (await login('nomin@demo.mn')).body.access_token;
  const good = (i, extra = {}) => ({ ovog: 'Импорт', ner: `Хүүхэд${i}`, registr: `ЖШ2011110${i}`, torson_ognoo: '2021-03-0' + i, huis: i % 2 ? 'Эр' : 'Эм',
    hayg: { duureg: 'Баянзүрх', horoo: 15, toyrgiin_baidal: 'Тойргийн' }, asran: { hen_boloh: 'Ээж', ovog: 'Бат', ner: `Ээж${i}`, utas: `9900000${i}` }, ...extra });
  const bad = await call('POST', '/api/v1/groups/1/children/import', T, { dry_run: true,
    rows: [good(1), { ...good(2), registr: 'AB123' }, good(1), { ovog: 'X', torson_ognoo: '2021-01-01', huis: 'Эр' }] });
  assert.equal(bad.status, 422); assert.equal(bad.body.error.code, 'IMPORT_INVALID');
  const rowsWithErr = [...new Set(bad.body.error.details.map((e) => e.mur))];
  assert.deepEqual(rowsWithErr, [2, 3, 4]);
  const before = (await call('GET', '/api/v1/groups/1/children', T)).body.length;
  const dry = await call('POST', '/api/v1/groups/1/children/import', T, { dry_run: true, rows: [good(1), good(2), good(3)] });
  assert.equal(dry.status, 200); assert.equal(dry.body.imported, 0);
  assert.equal((await call('GET', '/api/v1/groups/1/children', T)).body.length, before);
  const real = await call('POST', '/api/v1/groups/1/children/import', T, { rows: [good(1), good(2), good(3)] });
  assert.equal(real.status, 201); assert.equal(real.body.imported, 3);
  const after2 = await call('GET', '/api/v1/groups/1/children', T);
  assert.equal(after2.body.length, before + 3);
  const again = await call('POST', '/api/v1/groups/1/children/import', T, { rows: [good(1)] });
  assert.equal(again.status, 422); assert.match(again.body.error.details[0].aldaa, /бүртгэлтэй/);
  const M2 = await call('POST', '/api/v1/groups/1/children/import', null, { rows: [good(4)] });
  assert.equal(M2.status, 401);
});

test('хадгалалтын хугацаа: dry-run, дараа нь устгах', async () => {
  const T = (await login('nomin@demo.mn')).body.access_token;
  const imp = await call('POST', '/api/v1/groups/1/children/import', T, { rows: [{ ovog: 'Хуучин', ner: 'Төгсөгч', torson_ognoo: '2015-01-01', huis: 'Эм', elssen_ognoo: '2019-09-01' }] });
  assert.equal(imp.status, 201);
  const kids = (await call('GET', '/api/v1/groups/1/children', T)).body;
  const old = kids.find((k) => k.ner === 'Төгсөгч');
  assert.equal((await call('POST', `/api/v1/children/${old.suraltsagch_id}/leave`, T, { garsan_ognoo: '2020-05-31', tuluv: 'Төгссөн' })).status, 204);
  const env = { ...process.env, RETENTION_YEARS: '3' };
  const script = path.join(__dirname, '..', 'scripts', 'retention.js');
  const dry = JSON.parse(spawnSync(process.execPath, [script], { env, encoding: 'utf8' }).stdout);
  assert.equal(dry.mode, 'dry-run'); assert.equal(dry.suraltsagch, 1);
  assert.ok((await call('GET', `/api/v1/children/${old.suraltsagch_id}`, T)).status === 200);
  const run = JSON.parse(spawnSync(process.execPath, [script, '--apply'], { env, encoding: 'utf8' }).stdout);
  assert.equal(run.mode, 'apply'); assert.equal(run.suraltsagch, 1);
  assert.equal((await call('GET', `/api/v1/children/${old.suraltsagch_id}`, T)).status, 404);
  const noYears = spawnSync(process.execPath, [script], { env: { ...process.env, RETENTION_YEARS: '' }, encoding: 'utf8' });
  assert.equal(noYears.status, 2);
});
