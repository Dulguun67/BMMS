const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const ym = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const today = () => ymd(new Date());
export const thisMonth = () => ym(new Date());
export const WD = ['Ня', 'Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя'];

export function fmtDate(s) { if (!s) return ''; const [y, m, d] = String(s).slice(0, 10).split('-'); return `${y}.${m}.${d}`; }
export function fmtDT(s) { return s ? `${fmtDate(s)} ${String(s).slice(11, 16)}` : ''; }
export function fmtMonth(s) { if (!s) return ''; const [y, m] = String(s).split('-'); return `${y} оны ${Number(m)}-р сар`; }
export function money(n) { return `${Math.round(Number(n) || 0).toLocaleString('en-US').replace(/,/g, ' ')}₮`; }
export function age(months) { if (months == null) return ''; return `${Math.floor(months / 12)} нас ${months % 12} сар`; }
export function r2(x) { return x == null || Number.isNaN(x) ? '—' : Number(x).toFixed(2); }
export function avg(a) { const v = a.filter((x) => typeof x === 'number'); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; }
export const fullName = (c) => (c ? `${c.ovog ? `${c.ovog.slice(0, 1)}.` : ''}${c.ner}` : '—');

/** Хичээлийн жилийн 9 сар (9-р сараас 5-р сар) */
export function schoolMonths(startYear) {
  const out = [];
  for (let i = 0; i < 9; i++) { const d = new Date(startYear, 8 + i, 1); out.push(ym(d)); }
  return out;
}
export function lastDayOf(month) { const [y, m] = month.split('-').map(Number); return ymd(new Date(y, m, 0)); }

/** <form>-ийн утгыг объект болгоно; хоосон мөрийг орхино */
export function formData(form) {
  const o = {};
  for (const [k, v] of new FormData(form).entries()) {
    if (v === '') continue;
    if (o[k] !== undefined) o[k] = [].concat(o[k], v); else o[k] = v;
  }
  return o;
}
