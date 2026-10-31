// CSV оруулах туслах: кодчилол таних, задлах, баганыг таних, мөрийг API-ийн хэлбэрт хөрвүүлэх.

/**
 * Excel-ийн CSV нь UTF-8 эсвэл Windows-1251 байж болно. Windows-1251-д Ө, Ү үсэг байхгүй тул
 * ийм файлыг таньвал хэрэглэгчид "CSV UTF-8" хэлбэрээр дахин хадгалахыг санал болгоно.
 */
export function decodeCsv(buf) {
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^\uFEFF/, ''), encoding: 'utf-8' }; } catch {
    return { text: new TextDecoder('windows-1251').decode(buf), encoding: 'windows-1251' };
  }
}

/** RFC 4180: хашилт доторх таслал, мөр шилжилт, "" хоёрлолтыг дэмжинэ. Тусгаарлагчийг толгой мөрөөс таньна. */
export function parseCsv(text) {
  const head = text.split(/\r?\n/, 1)[0];
  const delim = [';', '\t', ','].map((d) => [d, head.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

export const COLUMNS = [
  ['ovog', 'Овог'], ['ner', 'Нэр'], ['registr', 'Регистр'], ['torson_ognoo', 'Төрсөн огноо'], ['huis', 'Хүйс'], ['tanih_temdeg', 'Таних тэмдэг'],
  ['duureg', 'Дүүрэг'], ['horoo', 'Хороо'], ['delgerengui_hayg', 'Хаяг'], ['toyrgiin_baidal', 'Тойрог'],
  ['asran_hen', 'Асран хамгаалагч (хэн болох)'], ['asran_ovog', 'Асран хамгаалагчийн овог'], ['asran_ner', 'Асран хамгаалагчийн нэр'], ['asran_utas', 'Асран хамгаалагчийн утас'],
];
const ALIASES = { registr: ['рд', 'регистрийн дугаар'], torson_ognoo: ['төрсөн он сар өдөр', 'огноо'], huis: ['хүйс'], delgerengui_hayg: ['дэлгэрэнгүй хаяг'],
  toyrgiin_baidal: ['тойргийн судалгаа'], asran_hen: ['хэн болох'], asran_utas: ['утас'] };
const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Толгой мөрийн нэрээр багануудыг таньна. Олдоогүй заавал баганыг буцаана. */
export function mapHeader(header) {
  const idx = {};
  header.forEach((h, i) => {
    const n = norm(h);
    for (const [k, label] of COLUMNS) {
      if (idx[k] === undefined && (n === norm(label) || n === k || (ALIASES[k] || []).includes(n))) idx[k] = i;
    }
  });
  const missing = ['ovog', 'ner', 'torson_ognoo', 'huis'].filter((k) => idx[k] === undefined).map((k) => COLUMNS.find((c) => c[0] === k)[1]);
  return { idx, missing };
}

const pad = (n) => String(n).padStart(2, '0');
/** 2021-03-15, 2021.03.15, 2021/3/15, 15.03.2021 (өдөр.сар.он), 3/15/2021 (Excel US) */
export function normDate(s) {
  const v = String(s || '').trim();
  let m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(v);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(v);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  if (m) return `${m[3]}-${pad(m[1])}-${pad(m[2])}`;
  return v;
}
function normSex(s) {
  const v = norm(String(s || ''));
  if (['эр', 'эрэгтэй', 'м', 'm', 'male'].includes(v)) return 'Эр';
  if (['эм', 'эмэгтэй', 'f', 'female'].includes(v)) return 'Эм';
  return s;
}

/** CSV мөрийг /children/import-ийн хэлбэрт хөрвүүлнэ (шалгалтыг сервер хийнэ) */
export function toRow(cells, idx) {
  const g = (k) => (idx[k] === undefined ? '' : String(cells[idx[k]] ?? '').trim());
  const row = { ovog: g('ovog'), ner: g('ner'), torson_ognoo: normDate(g('torson_ognoo')), huis: normSex(g('huis')) };
  if (g('registr')) row.registr = g('registr').toUpperCase().replace(/\s/g, '');
  if (g('tanih_temdeg')) row.tanih_temdeg = g('tanih_temdeg');
  if (g('duureg') || g('horoo')) {
    row.hayg = { duureg: g('duureg'), horoo: Number(g('horoo')) || g('horoo'), toyrgiin_baidal: /бус/i.test(g('toyrgiin_baidal')) ? 'Тойргийн бус' : 'Тойргийн' };
    if (g('delgerengui_hayg')) row.hayg.delgerengui_hayg = g('delgerengui_hayg');
  }
  if (g('asran_ner') || g('asran_utas')) {
    row.asran = { hen_boloh: g('asran_hen') || 'Ээж', ovog: g('asran_ovog'), ner: g('asran_ner'), utas: g('asran_utas').replace(/\D/g, '') };
  }
  return row;
}

export function templateCsv() {
  const head = COLUMNS.map((c) => c[1]);
  const ex = ['Бат', 'Анужин', 'АА21031512', '2021-03-15', 'Эм', 'Алим', 'Баянзүрх', '15', '12-р байр, 34 тоот', 'Тойргийн', 'Ээж', 'Дорж', 'Сарнай', '99112233'];
  const esc = (v) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return `\uFEFF${[head, ex].map((r) => r.map(esc).join(',')).join('\r\n')}\r\n`;
}
