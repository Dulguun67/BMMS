'use strict';
// Хадгалах хугацаа дууссан мэдээллийг устгах (өдөр бүр EventBridge-ээр ECS scheduled task болгон ажиллуулна).
//   RETENTION_YEARS=3 node scripts/retention.js            — зөвхөн тоолно (анхдагч)
//   RETENTION_YEARS=3 node scripts/retention.js --apply    — устгана
// Хугацааг хуульчийн зөвлөгөө, цэцэрлэгийн журмаар тогтооно. Заагаагүй бол ажиллахгүй.
// API-ийн өгөгдлийн сангийн тохиргоог (DB_*) ашиглана; bmms_app-д процедур ажиллуулах эрх бий.
const config = require('../src/config');
const db = require('../src/db');

(async () => {
  const years = Number(process.env.RETENTION_YEARS);
  if (!Number.isInteger(years) || years < 1 || years > 50) {
    console.error('RETENTION_YEARS (1–50 жил) заана уу. Хуулийн зөвлөгөөгөөр тогтоосон хугацааг ашиглана.');
    process.exit(2);
  }
  const apply = process.argv.includes('--apply');
  db.init(config.load());
  try {
    const r = await db.run(null, async (c) => {
      const [sets] = await c.query('CALL sp_hugatsaa_duussan_ustgah(?, ?)', [years, !apply]);
      return sets[0][0];
    });
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', retention_years: years, ...r }));
  } finally { await db.close(); }
})().catch((e) => { console.error(e.sqlMessage || e.message); process.exit(1); });
