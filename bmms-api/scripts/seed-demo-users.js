'use strict';
// ЗӨВХӨН туршилтын орчин (CI, локал E2E): demo хэрэглэгчдэд нууц үг тохируулж, admin@demo.mn үүсгэнэ.
//   DB_HOST=... DB_USER=... DB_PASSWORD=... E2E_PASSWORD=... node scripts/seed-demo-users.js
const mysql = require('mysql2/promise');
const pw = require('../src/security/password');

(async () => {
  if (process.env.NODE_ENV === 'production') throw new Error('Production орчинд ажиллуулахгүй');
  const pass = process.env.E2E_PASSWORD;
  if (!pass) throw new Error('E2E_PASSWORD заана уу');
  const c = await mysql.createConnection({ host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME || 'bmms' });
  try {
    const hash = await pw.hashPassword(pass);
    await c.query("UPDATE hereglegch SET nuuts_ug_hash = ? WHERE nevtreh_ner IN ('nomin@demo.mn', 'oyunaa@demo.mn')", [hash]);
    await c.query("INSERT IGNORE INTO hereglegch (nevtreh_ner, nuuts_ug_hash, uureg) VALUES ('admin@demo.mn', ?, 'admin')", [hash]);
    console.log('demo хэрэглэгчид бэлэн');
  } finally { await c.end(); }
})().catch((e) => { console.error(e.message); process.exit(1); });
