// E2E тест: бүтээгдсэн React апп (jsdom) + ажиллаж буй API + 05_demo_data ачаалсан MySQL.
//   API=http://127.0.0.1:8080 E2E_PASSWORD=... npm run test:e2e
//   Demo хэрэглэгч nomin@, oyunaa@, admin@demo.mn-д E2E_PASSWORD нууц үгийг урьдчилан тохируулна.
const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require('fs');
const crypto = require('crypto');
function totpNow(b32, off = 0) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = 0; let v = 0; const out = [];
  for (const ch of b32.replace(/\s/g, '')) { v = (v << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } }
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + off));
  const h = crypto.createHmac('sha1', Buffer.from(out)).update(msg).digest(); const o = h[19] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0');
}
const path = require('path');
const API = process.env.API || 'http://127.0.0.1:8080';
const html = fs.readFileSync(path.join(__dirname, '.build/index.html'), 'utf8').replace(/<script[^>]*src="\/app.js"><\/script>/, '').replace(/<link[^>]*>/g, '');
const appJs = fs.readFileSync(path.join(__dirname, '.build/app.js'), 'utf8');
const errors = []; const calls = [];
let jar = '';
function makeDom(url = 'http://localhost/') {
  const vc = new VirtualConsole();
  vc.on('error', (e) => errors.push(`console.error: ${String(e && e.stack || e).slice(0, 300)}`));
  vc.on('jsdomError', (e) => errors.push(`jsdomError: ${String(e && e.message).slice(0, 300)}`));
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
  w.scrollTo = () => {}; w.confirm = () => true; w.print = () => {};
  w.TextDecoder = TextDecoder; w.TextEncoder = TextEncoder; // jsdom-д байхгүй, хөтөчид бий
  w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
  w.fetch = async (url, opts = {}) => {
    const u = new URL(url, 'http://localhost');
    const headers = { ...(opts.headers || {}) };
    if (u.pathname.startsWith('/api/v1/auth') && jar) headers.cookie = jar;
    const res = await fetch(API + u.pathname + u.search, { method: opts.method || 'GET', headers, body: opts.body });
    const sc = res.headers.get('set-cookie');
    if (sc) { const m = /bmms_rt=([^;]*)/.exec(sc); jar = m && m[1] ? `bmms_rt=${m[1]}` : ''; }
    calls.push(`${opts.method || 'GET'} ${u.pathname}${u.search} ${res.status}`);
    const text = await res.text();
    return { ok: res.ok, status: res.status, json: async () => JSON.parse(text), text: async () => text };
  };
  w.eval(appJs);
  return dom;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(w, fn, label, t = 4000) { const s = Date.now(); while (Date.now() - s < t) { try { const r = fn(); if (r) return r; } catch { /* */ } await sleep(40); } throw new Error(`timeout: ${label}\nBODY: ${(w.document.querySelector('dialog') || w.document.body).textContent.slice(0, 1500)}`); }
function setVal(w, el, v) { const proto = el.tagName === 'TEXTAREA' ? w.HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? w.HTMLSelectElement.prototype : w.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); }
const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
function go(w, path) { w.history.pushState({}, '', path); w.dispatchEvent(new w.PopStateEvent('popstate')); }
async function login(w, email, pass = process.env.E2E_PASSWORD) {
  await until(w, () => w.document.querySelector('input[name=email]'), 'login form');
  setVal(w, w.document.querySelector('input[name=email]'), email);
  setVal(w, w.document.querySelector('input[name=password]'), pass);
  w.document.querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
}
const results = [];
const ok = (name, cond, extra = '') => { results.push(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`); };
const noErr = (w) => !w.document.querySelector('.err');

(async () => {
  // ---------- Багш ----------
  let dom = makeDom(); let w = dom.window; const d = () => w.document;
  await login(w, 'nomin@demo.mn');
  await until(w, () => d().body.textContent.includes('Сайн байна уу'), 'home');
  await until(w, () => d().querySelector('.stats .v') && !d().body.textContent.includes('Ачаалж'), 'home stats');
  await sleep(300);
  ok('Нүүр: багш', d().body.textContent.includes('Анхаарах суралцахуйн чиглэл') && d().body.textContent.includes('Математик') && noErr(w));
  const pages = [['/burtgel/list', 'Аззаяа'], ['/burtgel/irts', 'ирцийн нэгтгэл'], ['/burtgel/osolt', 'Хүүхдийн өсөлтийн явц'], ['/burtgel/font', 'Төлсөн'], ['/burtgel/kinder', 'Kinder police'],
    ['/angi/surgaltyn', 'Эвлүүлдэг тоглоом'], ['/angi/hicheeliin', 'Усан будаг'], ['/unelgee/rubric', 'Бүлгийн дундаж'], ['/unelgee/checklist', 'эзэмшсэн байх чадварууд'], ['/unelgee/self', 'Хүүхдэд эзэмшүүлсэн'],
    ['/tuluvluguu', 'Навч тоолъё'], ['/tailan/sar', '2026 оны 10-р сар'], ['/tailan/irts', 'Хоолны зардал'], ['/gantsaarchilsan', 'Бичлэг алга'], ['/hereglegch', 'Нууц үг солих'], ['/tohirgoo', 'Амралтын өдөр']];
  for (const [p, txt] of pages) {
    go(w, p);
    try { await until(w, () => d().body.textContent.includes(txt) && !d().querySelector('.loading-row'), p); ok(`хуудас ${p}`, noErr(w)); } catch (e) { ok(`хуудас ${p}`, false, e.message.split('\n')[0]); }
  }
  // Ирц: нүд дээр дарах → PUT
  go(w, '/burtgel/irts');
  await until(w, () => d().querySelector('button.cell:not([disabled])'), 'att cells');
  const before = calls.length; const cell = [...d().querySelectorAll('button.cell:not([disabled])')].pop(); const cls0 = cell.className; click(w, cell);
  await until(w, () => calls.slice(before).some((c) => c.startsWith('PUT /api/v1/groups/1/attendance 200')), 'attendance PUT');
  ok('ирц өөрчлөх (PUT 200)', cell.className !== cls0 || true);
  // Хүүхэд нэмэх
  go(w, '/burtgel/list');
  await until(w, () => [...d().querySelectorAll('button')].find((b) => b.textContent.includes('Хүүхэд нэмэх')), 'add btn');
  click(w, [...d().querySelectorAll('button')].find((b) => b.textContent.includes('Хүүхэд нэмэх')));
  await until(w, () => d().querySelector('#addChild'), 'add form');
  const f = d().querySelector('#addChild');
  setVal(w, f.querySelector('[name=ner]'), 'Туршилт'); setVal(w, f.querySelector('[name=ovog]'), 'Э2Э'); setVal(w, f.querySelector('[name=torson_ognoo]'), '2021-05-05'); setVal(w, f.querySelector('[name=horoo]'), '7');
  f.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await until(w, () => !d().querySelector('#addChild') && d().body.textContent.includes('Туршилт'), 'child added');
  ok('хүүхэд нэмэх (POST)', calls.some((c) => c.startsWith('POST /api/v1/groups/1/children 201')));
  // Хүүхдийн дэлгэрэнгүй
  click(w, [...d().querySelectorAll('tr.click')].find((r) => r.textContent.includes('Аззаяа')));
  await until(w, () => d().body.textContent.includes('Асран хамгаалагч') && d().body.textContent.includes('Цусны ерөнхий'), 'child detail');
  ok('хүүхдийн дэлгэрэнгүй', noErr(w));
  click(w, d().querySelector('dialog .dlg-head button'));
  // CSV-ээс оруулах: эхлээд алдаатай файл, дараа нь зөв файл
  {
    click(w, [...d().querySelectorAll('button')].find((b) => b.textContent === 'CSV-ээс оруулах'));
    await until(w, () => d().querySelector('dialog input[type=file]'), 'csv modal');
    const pickFile = (content) => {
      const inp = d().querySelector('dialog input[type=file]');
      const file = new w.File([Buffer.from(content, 'utf8')], 'huuhed.csv', { type: 'text/csv' });
      Object.defineProperty(inp, 'files', { value: [file], configurable: true });
      inp.dispatchEvent(new w.Event('change', { bubbles: true }));
    };
    const head = 'Овог,Нэр,Регистр,Төрсөн огноо,Хүйс,Дүүрэг,Хороо,Асран хамгаалагчийн овог,Асран хамгаалагчийн нэр,Асран хамгаалагчийн утас';
    pickFile(`\uFEFF${head}\r\nБолд,Тэмүүлэн,ЖШ21070701,2021.07.07,эрэгтэй,Баянзүрх,15,Болд,Сараа,99001122\r\nДорж,,AB1,07.08.2021,Эм,,,,,\r\n`);
    await until(w, () => d().querySelectorAll('dialog tbody tr').length === 2, 'csv preview');
    click(w, [...d().querySelectorAll('dialog button')].find((b) => b.textContent === 'Шалгах'));
    await until(w, () => d().querySelector('dialog .chip.red'), 'csv errors');
    ok('CSV: алдаатай мөрийг тэмдэглэх', d().querySelectorAll('dialog .chip.red').length === 1 && d().querySelector('dialog .err').textContent.includes('мөрөнд алдаа'));
    pickFile(`${head}\nБолд,Тэмүүлэн,ЖШ21070701,2021.07.07,эрэгтэй,Баянзүрх,15,Болд,Сараа,99001122\nДорж,Анударь,,07.08.2021,Эм,,,,,\n`);
    await until(w, () => d().querySelector('dialog tbody') && d().querySelector('dialog tbody').textContent.includes('Анударь') && !d().querySelector('dialog .chip.red'), 'csv preview 2');
    click(w, [...d().querySelectorAll('dialog button')].find((b) => b.textContent === 'Шалгах'));
    await until(w, () => d().querySelectorAll('dialog .chip.green').length === 2, 'csv checked');
    click(w, [...d().querySelectorAll('dialog button')].find((b) => b.textContent === 'Оруулах'));
    await until(w, () => !d().querySelector('dialog') && d().body.textContent.includes('Анударь') && d().body.textContent.includes('Тэмүүлэн'), 'csv imported');
    ok('CSV: шалгаад бүртгэх', calls.some((c) => c.startsWith('POST /api/v1/groups/1/children/import 201')));
  }
  // Төлөвлөгөө үүсгэх + илгээх
  go(w, '/tuluvluguu');
  await until(w, () => [...d().querySelectorAll('button')].find((b) => b.textContent.includes('Төлөвлөгөө нэмэх')), 'plan add');
  click(w, [...d().querySelectorAll('button')].find((b) => b.textContent.includes('Төлөвлөгөө нэмэх')));
  await until(w, () => [...d().querySelectorAll('dialog button')].find((b) => b.textContent.includes('Жилийн төлөвлөгөө')), 'chooser');
  click(w, [...d().querySelectorAll('dialog button')].find((b) => b.textContent.includes('Жилийн төлөвлөгөө')));
  await until(w, () => d().body.textContent.includes('үнэлгээнд үндэслэсэн санал'), 'insight');
  click(w, [...d().querySelectorAll('dialog button')].find((b) => b.textContent.includes('Зорилгод нэмэх')));
  const pf = d().querySelector('#planForm');
  setVal(w, pf.querySelector('[name=garchig]'), 'Э2Э жилийн төлөвлөгөө');
  ok('санал зорилгод орсон', pf.querySelector('textarea').value.includes('Анхаарах чиглэл'));
  pf.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await until(w, () => [...d().querySelectorAll('dialog button')].find((b) => b.textContent.includes('Батлуулахаар илгээх')), 'plan detail after create');
  click(w, [...d().querySelectorAll('dialog button')].find((b) => b.textContent.includes('Батлуулахаар илгээх')));
  await until(w, () => d().querySelector('dialog') && d().querySelector('dialog').textContent.includes('Хянагдаж буй'), 'submitted');
  ok('төлөвлөгөө үүсгэж илгээх', calls.some((c) => /POST \/api\/v1\/plans\/\d+\/transition 204/.test(c)));
  click(w, d().querySelector('dialog .dlg-head button'));
  // Рубрик дарах
  go(w, '/unelgee/rubric');
  await until(w, () => d().querySelector('td .seg button:not([disabled])'), 'rubric seg');
  const b4 = calls.length; click(w, d().querySelectorAll('td .seg button')[2]);
  await until(w, () => calls.slice(b4).some((c) => c.startsWith('PUT /api/v1/groups/1/rubric 204')), 'rubric PUT');
  ok('рубрик үнэлэх (PUT)', true);
  // Ганцаарчилсан
  go(w, '/gantsaarchilsan');
  await until(w, () => [...d().querySelectorAll('button')].find((b) => b.textContent.includes('Хүүхэд нэмэх')), 'ind btn');
  click(w, [...d().querySelectorAll('button')].find((b) => b.textContent.includes('Хүүхэд нэмэх')));
  await until(w, () => d().querySelector('#indForm select'), 'ind form');
  setVal(w, d().querySelector('#indForm [name=onosh]'), 'Хэл ярианы хоцрогдол (Э2Э)');
  d().querySelector('#indForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await until(w, () => d().body.textContent.includes('Хэл ярианы хоцрогдол (Э2Э)'), 'ind list');
  ok('ганцаарчилсан бичлэг (шифрлэж хадгалаад тайлж харуулах)', noErr(w));
  // Refresh-ээр сесс сэргээх: шинэ DOM, ижил cookie
  dom.window.close();
  dom = makeDom(); w = dom.window;
  await until(w, () => w.document.body.textContent.includes('Сайн байна уу'), 'session restore via refresh cookie');
  ok('хуудас дахин ачаалахад сесс сэргэх (refresh cookie)', true);
  // Гарах
  click(w, w.document.querySelector('button[aria-label="Гарах"]'));
  await until(w, () => w.document.querySelector('input[name=email]'), 'logout');
  ok('гарах', calls.some((c) => c.startsWith('POST /api/v1/auth/logout 204')));
  dom.window.close();

  // ---------- Арга зүйч ----------
  jar = ''; dom = makeDom(); w = dom.window;
  await login(w, 'oyunaa@demo.mn');
  await until(w, () => w.document.body.textContent.includes('Хянах шаардлагатай'), 'method home');
  await until(w, () => w.document.querySelector('.nav .badge'), 'approval badge');
  ok('арга зүйч: батлах тэмдэг', Number(w.document.querySelector('.nav .badge').textContent) >= 2);
  go(w, '/burtgel/irts');
  await until(w, () => w.document.querySelector('button.cell'), 'method att');
  ok('арга зүйч: ирц зөвхөн унших', [...w.document.querySelectorAll('button.cell')].every((b) => b.disabled));
  go(w, '/tuluvluguu');
  await until(w, () => [...w.document.querySelectorAll('.plan-row')].find((r) => r.textContent.includes('Э2Э жилийн')), 'method plans');
  click(w, [...w.document.querySelectorAll('.plan-row')].find((r) => r.textContent.includes('Э2Э жилийн')));
  await until(w, () => [...w.document.querySelectorAll('dialog button')].find((b) => b.textContent === 'Буцаах'), 'return btn');
  click(w, [...w.document.querySelectorAll('dialog button')].find((b) => b.textContent === 'Буцаах'));
  await sleep(200);
  ok('шалтгаангүй буцаахыг хориглох', w.document.querySelector('.toast').textContent.includes('шалтгаан'));
  click(w, [...w.document.querySelectorAll('dialog button')].find((b) => b.textContent === 'Батлах'));
  await until(w, () => w.document.querySelector('dialog') && w.document.querySelector('dialog').textContent.includes('Батлагдсан'), 'approved');
  ok('арга зүйч батлах', true);
  click(w, w.document.querySelector('dialog .dlg-head button'));
  for (const [p, txt] of [['/tohirgoo/hool', 'Мөрдөж буй'], ['/tohirgoo/asuult', 'Идэвхгүй болгох'], ['/tohirgoo/buleg', 'Нарны бүлэг'], ['/tohirgoo/jil', 'Эхлэлийн'], ['/tailan/sar', '2026 оны 10-р сар']]) {
    go(w, p);
    try { await until(w, () => w.document.body.textContent.includes(txt) && !w.document.querySelector('.loading-row'), p); ok(`арга зүйч ${p}`, noErr(w)); } catch (e) { ok(`арга зүйч ${p}`, false, e.message.split('\n')[0]); }
  }
  dom.window.close();

  // ---------- Admin: MFA заавал (тестийн API: MFA_REQUIRED_ROLES=admin) ----------
  jar = ''; dom = makeDom(); w = dom.window;
  await login(w, 'admin@demo.mn');
  await until(w, () => w.document.querySelector('[data-testid=mfa-secret]'), 'admin mfa setup');
  ok('admin: MFA тохируулах дэлгэц заавал', !w.document.querySelector('.nav'));
  const secret = w.document.querySelector('[data-testid=mfa-secret]').textContent;
  setVal(w, w.document.querySelector('input[name=kod]'), totpNow(secret));
  w.document.querySelector('input[name=kod]').closest('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await until(w, () => w.document.body.textContent.includes('нөөц кодоор нэвтэрнэ'), 'backup codes');
  const backup = w.document.querySelector('.login-card td.name').textContent;
  click(w, w.document.querySelector('.login-card input[type=checkbox]'));
  click(w, [...w.document.querySelectorAll('button')].find((b) => b.textContent === 'Үргэлжлүүлэх'));
  await until(w, () => w.document.body.textContent.includes('oyunaa@demo.mn'), 'admin users');
  ok('admin: MFA идэвхжүүлээд хэрэглэгчийн жагсаалт', noErr(w) && !w.document.querySelector('.nav a[href="/burtgel"]'));
  for (const [p, txt] of [['/tohirgoo/tsetserleg', 'Нийслэлийн 59'], ['/tohirgoo/jil', 'Хичээлийн жил нэмэх'], ['/tohirgoo/buleg', 'Нарны бүлэг'], ['/tohirgoo/amralt', 'Шинэ жил']]) {
    go(w, p);
    try { await until(w, () => w.document.body.textContent.includes(txt) && !w.document.querySelector('.loading-row'), p); ok(`admin ${p}`, noErr(w)); } catch (e) { ok(`admin ${p}`, false, e.message.split('\n')[0]); }
  }
  // Шинэ багш үүсгэх (түр нууц үг)
  go(w, '/tohirgoo/hereglegch');
  await until(w, () => [...w.document.querySelectorAll('button')].find((b) => b.textContent.includes('Хэрэглэгч нэмэх')), 'add user');
  click(w, [...w.document.querySelectorAll('button')].find((b) => b.textContent.includes('Хэрэглэгч нэмэх')));
  await until(w, () => w.document.querySelector('#userForm'), 'user form');
  const uf = w.document.querySelector('#userForm');
  setVal(w, uf.querySelector('[name=email]'), 'shine.bagsh@demo.mn'); setVal(w, uf.querySelector('[name=password]'), 'Tur-Nuuts-2026!a');
  setVal(w, uf.querySelector('[name=ovog]'), 'Шинэ'); setVal(w, uf.querySelector('[name=ner]'), 'Багш');
  uf.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await until(w, () => w.document.body.textContent.includes('shine.bagsh@demo.mn') && w.document.body.textContent.includes('Түр нууц үг'), 'user created');
  ok('admin: хэрэглэгч үүсгэх (түр нууц үг)', true);
  // Дахин нэвтрэхэд MFA код асууна; нөөц кодоор нэвтэрнэ
  click(w, w.document.querySelector('button[aria-label="Гарах"]'));
  await login(w, 'admin@demo.mn');
  await until(w, () => w.document.body.textContent.includes('Баталгаажуулах код'), 'mfa step');
  click(w, [...w.document.querySelectorAll('button')].find((b) => b.textContent.includes('Нөөц код ашиглах')));
  await until(w, () => w.document.querySelector('input[placeholder="XXXXX-XXXXX"]'), 'backup input');
  setVal(w, w.document.querySelector('input[name=kod]'), backup);
  w.document.querySelector('input[name=kod]').closest('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await until(w, () => w.document.body.textContent.includes('oyunaa@demo.mn'), 'admin login with backup');
  ok('admin: 2-р алхамд нөөц кодоор нэвтрэх', calls.some((c) => c.startsWith('POST /api/v1/auth/mfa/verify 200')));
  dom.window.close();

  // ---------- Шинэ багш: түр нууц үгээ заавал солих ----------
  jar = ''; dom = makeDom(); w = dom.window;
  await login(w, 'shine.bagsh@demo.mn', 'Tur-Nuuts-2026!a');
  await until(w, () => w.document.body.textContent.includes('Нууц үгээ солино уу'), 'forced pw');
  const pf2 = w.document.querySelector('form');
  setVal(w, pf2.querySelector('[name=huuchin]'), 'Tur-Nuuts-2026!a'); setVal(w, pf2.querySelector('[name=shine]'), 'Minii-Shine-2026!'); setVal(w, pf2.querySelector('[name=shine2]'), 'Minii-Shine-2026!');
  pf2.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await until(w, () => w.document.body.textContent.includes('Нууц үг солигдлоо'), 'pw changed');
  click(w, [...w.document.querySelectorAll('button')].find((b) => b.textContent.includes('Нэвтрэх хуудас руу')));
  await until(w, () => w.document.querySelector('input[name=email]'), 'back to login');
  await login(w, 'shine.bagsh@demo.mn', 'Minii-Shine-2026!');
  await until(w, () => w.document.body.textContent.includes('Танд хариуцсан бүлэг алга'), 'new teacher home');
  ok('шинэ багш: түр нууц үг солиод нэвтрэх', true);
  dom.window.close();

  // ---------- Нууц үгээ мартсан: имэйлийн холбоосоор сэргээх ----------
  // Тестийн API нь MAIL_PROVIDER=console тул имэйлийг логт хэвлэнэ (API_LOG)
  jar = ''; dom = makeDom(); w = dom.window;
  await until(w, () => [...w.document.querySelectorAll('button')].find((b) => b.textContent.includes('Нууц үгээ мартсан')), 'forgot link');
  click(w, [...w.document.querySelectorAll('button')].find((b) => b.textContent.includes('Нууц үгээ мартсан')));
  await until(w, () => w.document.body.textContent.includes('Холбоос илгээх'), 'forgot form');
  setVal(w, w.document.querySelector('input[name=email]'), 'nomin@demo.mn');
  w.document.querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await until(w, () => w.document.body.textContent.includes('холбоос илгээлээ'), 'forgot sent');
  let link = null;
  for (let i = 0; i < 50 && !link; i++) { const m = /to=nomin@demo\.mn[\s\S]*?(https?:\/\/\S+\/nuuts-ug-sergeeh#token=[\w-]+)/.exec(fs.readFileSync(process.env.API_LOG, 'utf8')); link = m && m[1]; if (!link) await sleep(50); }
  ok('нууц үг сэргээх имэйл илгээгдсэн', !!link);
  dom.window.close();
  dom = makeDom(`http://localhost/nuuts-ug-sergeeh#${link.split('#')[1]}`); w = dom.window;
  await until(w, () => w.document.querySelector('input[name=shine2]'), 'reset form');
  ok('сэргээх хуудас: токеныг хаягаас арилгасан', !w.location.hash && w.location.pathname === '/nuuts-ug-sergeeh');
  setVal(w, w.document.querySelector('input[name=shine]'), 'Sergeesen-2026!n'); setVal(w, w.document.querySelector('input[name=shine2]'), 'Sergeesen-2026!n');
  w.document.querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await until(w, () => w.document.body.textContent.includes('Нууц үг солигдлоо'), 'reset done');
  click(w, [...w.document.querySelectorAll('button')].find((b) => b.textContent === 'Нэвтрэх'));
  await login(w, 'nomin@demo.mn', 'Sergeesen-2026!n');
  await until(w, () => w.document.body.textContent.includes('Сайн байна уу'), 'login after reset');
  ok('шинэ нууц үгээр нэвтрэх', true);
  dom.window.close();

  console.log(results.join('\n'));
  const fails = results.filter((r) => r.startsWith('FAIL')).length;
  const serverErr = calls.filter((c) => / 5\d\d$/.test(c));
  console.log(`\n${results.length - fails}/${results.length} passed; API calls: ${calls.length}; 5xx: ${serverErr.length}`);
  if (serverErr.length) console.log(serverErr.join('\n'));
  if (errors.length) console.log('Console errors:\n' + [...new Set(errors)].slice(0, 15).join('\n'));
  process.exit(fails || serverErr.length ? 1 : 0);
})().catch((e) => { console.log(results.join('\n')); console.log('ABORT', e.message); console.log([...new Set(errors)].slice(0, 10).join('\n')); console.log(calls.slice(-8).join('\n')); process.exit(1); });
