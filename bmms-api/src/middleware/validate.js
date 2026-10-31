'use strict';
const { z } = require('zod');
const { unprocessable } = require('./errors');

function parse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw unprocessable('Оролтын өгөгдөл буруу',
      r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
  }
  return r.data;
}

const id = z.coerce.number().int().positive();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD хэлбэртэй');
const datetime = z.string().regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/, 'YYYY-MM-DD HH:MM хэлбэртэй')
  .transform((s) => s.replace('T', ' ').padEnd(19, ':00').slice(0, 19));
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'YYYY-MM хэлбэртэй');
const text = (max) => z.string().trim().max(max);
const reqText = (max) => z.string().trim().min(1, 'Хоосон байж болохгүй').max(max);
const phone = z.string().regex(/^\d{8}$/, '8 оронтой утасны дугаар');
const registr = z.string().trim().toUpperCase().regex(/^[А-ЯӨҮЁ]{2}\d{8}$/, 'РД: 2 үсэг, 8 цифр');
const idParam = z.object({ id });

const ENUM = {
  duureg: ['Багануур', 'Багахангай', 'Баянгол', 'Баянзүрх', 'Налайх', 'Сонгинохайрхан', 'Сүхбаатар', 'Хан-Уул', 'Чингэлтэй'],
  irts: ['Ирсэн', 'Чөлөөтэй', 'Өвчтэй', 'Тасалсан'],
  font: ['Төлсөн', 'Төлөөгүй', 'Чөлөөлсөн'],
  hen: ['Ээж', 'Аав', 'Эмээ', 'Өвөө', 'Ах', 'Эгч', 'Бусад'],
  tlTurul: ['Жилийн', 'Улирлын', 'Сарын', 'Үйл ажиллагааны'],
  helber: ['Бүлгээр', 'Багаар', 'Ганцаарчилсан'],
  bulegTurul: ['Бага', 'Дунд', 'Ахлах', 'Бэлтгэл'],
  osoltUnelgee: ['Хэвийн', 'Тураалтай', 'Илүүдэл жинтэй', 'Намхан'],
  angilal: ['Тоглоом', 'Ном', 'Хэрэглэгдэхүүн', 'Тавилга'],
  alban: ['Бүлгийн багш', 'Туслах багш', 'Заах арга зүйч', 'Эрхлэгч'],
  uureg: ['bagsh', 'arga_zuich', 'admin'],
  uyeTurul: ['Эхлэлийн', 'Явцын', 'Төгсгөлийн'],
};

/** "YYYY-MM" → "YYYY-MM-01" */
const monthStart = (m) => `${m}-01`;

module.exports = { z, parse, id, date, datetime, month, monthStart, text, reqText, phone, registr, idParam, ENUM };
