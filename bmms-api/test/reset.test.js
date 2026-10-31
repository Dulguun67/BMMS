'use strict';
// Нууц үг сэргээх: ижил хариу, нэг удаагийн токен, хугацаа, давтамжийн хязгаар, MFA шаардах, admin илгээх.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= crypto.randomBytes(32).toString('hex');
process.env.COOKIE_SECURE = 'false';
process.env.LOGIN_RATE_LIMIT = '200';
process.env.LOG_LEVEL = 'silent';
process.env.MAIL_PROVIDER = 'memory';
process.env.APP_URL = 'https://bmms.example.mn';
process.env.MFA_REQUIRED_ROLES = '';
process.env.MFA_PEPPER ||= 'test-only-pepper-0123456789abcdef0123';
process.env.FIELD_KEYS ||= JSON.stringify({ ktest: Buffer.alloc(32, 7).toString('base64') });
process.env.FIELD_KEY_ACTIVE ||= 'ktest';

const { bootstrap } = require('../src/server');
const db = require('../src/db');
const pw = require('../src/security/password');
const totp = require('../src/security/totp');
const { outbox } = require('../src/mail/mailer');

const PASS = 'Tur$hilt-2026-pass';
const EMAIL = 'reset.bagsh@demo.mn';
let server; let base; let A;
async function call(method, p, token, body) {
  const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await res.text();
  return { status: res.status, body: t ? JSON.parse(t) : null };
}
const login = (email, pass) => call('POST', '/api/v1/auth/login', null, { nevtreh_ner: email, nuuts_ug: pass });
async function nextMail(to, n0) {
  for (let i = 0; i < 100; i++) { const m = outbox.slice(n0).find((x) => x.to === to); if (m) return m; await new Promise((r) => { setTimeout(r, 20); }); }
  return null;
}
const tokenOf = (m) => /#token=([\w-]+)/.exec(m.text)[1];
const forgot = async (email) => { const n0 = outbox.length; const r = await call('POST', '/api/v1/auth/password/forgot', null, { nevtreh_ner: email }); return { r, n0 }; };

before(async () => {
  const { app } = bootstrap();
  const hash = await pw.hashPassword(PASS);
  await db.run(null, (c) => c.query("UPDATE hereglegch SET nuuts_ug_hash = ?, tuluv = 'idevhtei', tugjigdsen_hurtel = NULL, amjiltgui_oroldlogo = 0 WHERE nevtreh_ner = 'admin@demo.mn'", [hash]));
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  A = (await login('admin@demo.mn', PASS)).body.access_token;
  const u = await call('POST', '/api/v1/admin/users', A, { nevtreh_ner: EMAIL, nuuts_ug: 'Tur-Nuuts-2026!z', uureg: 'bagsh',
    profile: { tsetserleg_id: 1, ovog: 'Сэргээх', ner: 'Туршилт', alban_tushaal: 'Бүлгийн багш' } });
  assert.equal(u.status, 201);
});
after(async () => { server.close(); await db.close(); });

test('бүртгэлгүй имэйл: ижил хариу, имэйл илгээхгүй', async () => {
  const { r, n0 } = await forgot('baihgui@demo.mn');
  assert.equal(r.status, 202); assert.deepEqual(r.body, { ok: true });
  await new Promise((res) => { setTimeout(res, 200); });
  assert.equal(outbox.length, n0);
});

test('холбоосоор нууц үг сэргээх, түр нууц үгийн шаардлагыг арилгах', async () => {
  const { r, n0 } = await forgot(EMAIL.toUpperCase());
  assert.equal(r.status, 202);
  const m = await nextMail(EMAIL, n0);
  assert.ok(m, 'имэйл ирсэн'); assert.match(m.text, /https:\/\/bmms\.example\.mn\/nuuts-ug-sergeeh#token=/); assert.match(m.html, /Туршилт/);
  const token = tokenOf(m);
  const stored = await db.run(null, (c) => db.q(c, "SELECT token_hash FROM nuuts_ug_sergeelt s JOIN hereglegch h USING (hereglegch_id) WHERE h.nevtreh_ner = ?", [EMAIL]));
  assert.ok(stored.every((s) => s.token_hash !== token) && stored.some((s) => s.token_hash === crypto.createHash('sha256').update(token).digest('hex')));
  assert.deepEqual((await call('POST', '/api/v1/auth/password/reset/check', null, { token })).body, { valid: true, mfa_required: false });
  assert.equal((await call('POST', '/api/v1/auth/password/reset', null, { token, shine: 'short' })).status, 422);
  assert.equal((await call('POST', '/api/v1/auth/password/reset', null, { token: 'x'.repeat(43), shine: 'Shine-Nuuts-2026!' })).status, 400);
  const n1 = outbox.length;
  assert.equal((await call('POST', '/api/v1/auth/password/reset', null, { token, shine: 'Shine-Nuuts-2026!' })).status, 204);
  assert.match((await nextMail(EMAIL, n1)).subject, /солигдлоо/);
  assert.equal((await call('POST', '/api/v1/auth/password/reset', null, { token, shine: 'Busad-Nuuts-2026!' })).status, 400); // нэг удаа
  assert.equal((await login(EMAIL, 'Tur-Nuuts-2026!z')).status, 401);
  const l = await login(EMAIL, 'Shine-Nuuts-2026!');
  assert.equal(l.status, 200);
  assert.equal((await call('GET', '/api/v1/auth/me', l.body.access_token)).body.hyazgaarlalt, null); // түр нууц үгийн шаардлага арилсан
});

test('шинэ хүсэлт хуучин холбоосыг хүчингүй болгох, хугацаа, давтамжийн хязгаар', async () => {
  const a = await forgot(EMAIL); const t1 = tokenOf(await nextMail(EMAIL, a.n0));
  const b = await forgot(EMAIL); const t2 = tokenOf(await nextMail(EMAIL, b.n0));
  assert.equal((await call('POST', '/api/v1/auth/password/reset/check', null, { token: t1 })).status, 400);
  assert.equal((await call('POST', '/api/v1/auth/password/reset/check', null, { token: t2 })).status, 200);
  await db.run(null, (c) => c.query('UPDATE nuuts_ug_sergeelt SET duusah_hugatsaa = NOW() - INTERVAL 1 MINUTE WHERE token_hash = ?', [crypto.createHash('sha256').update(t2).digest('hex')]));
  assert.equal((await call('POST', '/api/v1/auth/password/reset', null, { token: t2, shine: 'Hugatsaa-2026!x' })).status, 400);
  // Нэг цагт 3-аас олон хүсэлт: имэйл илгээхгүй, хариу ижил
  const c = await forgot(EMAIL); // 4 дэх (өмнөх тестийн 1 + энэ тестийн 2)
  assert.equal(c.r.status, 202);
  assert.equal(await nextMail(EMAIL, c.n0), null);
});

test('MFA идэвхтэй бол 2-р хүчин зүйл шаардана; admin холбоос илгээнэ', async () => {
  await db.run(null, (c) => c.query("DELETE FROM nuuts_ug_sergeelt WHERE hereglegch_id = (SELECT hereglegch_id FROM hereglegch WHERE nevtreh_ner = ?)", [EMAIL]));
  const T = (await login(EMAIL, 'Shine-Nuuts-2026!')).body.access_token;
  const s = await call('POST', '/api/v1/auth/mfa/setup', T);
  const sec = totp.base32Decode(s.body.tulhuur);
  const act = await call('POST', '/api/v1/auth/mfa/activate', T, { kod: totp.hotp(sec, totp.stepAt()) });
  assert.equal(act.status, 200);
  const users = (await call('GET', '/api/v1/admin/users', A)).body;
  const me = users.find((u) => u.nevtreh_ner === EMAIL);
  const n0 = outbox.length;
  assert.equal((await call('POST', `/api/v1/admin/users/${me.hereglegch_id}/send-reset`, A)).status, 202);
  assert.equal((await call('POST', `/api/v1/admin/users/${me.hereglegch_id}/send-reset`, T)).status, 403);
  const m = await nextMail(EMAIL, n0);
  assert.match(m.text, /Систем хариуцагч/);
  const token = tokenOf(m);
  assert.equal((await call('POST', '/api/v1/auth/password/reset/check', null, { token })).body.mfa_required, true);
  const noCode = await call('POST', '/api/v1/auth/password/reset', null, { token, shine: 'Mfa-Shine-2026!q' });
  assert.equal(noCode.status, 401); assert.equal(noCode.body.error.code, 'MFA_REQUIRED');
  assert.equal((await call('POST', '/api/v1/auth/password/reset', null, { token, shine: 'Mfa-Shine-2026!q', kod: '000000' })).status, 401);
  assert.equal((await call('POST', '/api/v1/auth/password/reset/check', null, { token })).status, 200); // буруу код токеныг устгахгүй
  assert.equal((await call('POST', '/api/v1/auth/password/reset', null, { token, shine: 'Mfa-Shine-2026!q', kod: act.body.noots_kod[0] })).status, 204);
  assert.equal((await call('GET', '/api/v1/auth/me', T)).status, 401); // сэргээсний дараа хуучин access token ч хүчингүй
  const l = await login(EMAIL, 'Mfa-Shine-2026!q');
  assert.equal(l.body.mfa_required, true);
  // Идэвхгүй хэрэглэгчид илгээхгүй
  await call('PATCH', `/api/v1/admin/users/${me.hereglegch_id}`, A, { tuluv: 'idevhgui' });
  assert.equal((await call('POST', `/api/v1/admin/users/${me.hereglegch_id}/send-reset`, A)).status, 404);
});
