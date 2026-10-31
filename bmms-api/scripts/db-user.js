'use strict';
// API-ийн өгөгдлийн сангийн хэрэглэгчийг үүсгэх/нууц үгийг шинэчлэх (bmms_app role-той).
// Нэг удаагийн ECS task болгон master эрхээр ажиллуулна:
//   MIGRATE_DB_USER / MIGRATE_DB_PASSWORD — RDS master (RDS-ийн удирддаг Secrets Manager нууц)
//   APP_DB_USER (анхдагч bmms_api) / APP_DB_PASSWORD — API-ийн нууц (bmms/<env>/app)
// Нууц үгийг Secrets Manager-т сольсны дараа энэ task-ыг дахин ажиллуулж DB-д тусгана.
const { connect } = require('./migrate');

(async () => {
  const user = process.env.APP_DB_USER || 'bmms_api';
  const pass = process.env.APP_DB_PASSWORD;
  const ssl = (process.env.DB_USER_REQUIRE_SSL || 'true') === 'true';
  if (!/^\w{1,32}$/.test(user)) throw new Error('APP_DB_USER буруу');
  if (!pass || pass.length < 24) throw new Error('APP_DB_PASSWORD (24+ тэмдэгт) заана уу');
  const { conn } = await connect(true);
  try {
    const req = ssl ? ' REQUIRE SSL' : '';
    // Хэрэглэгчийн нэр, нууц үгийг mysql2 escape хийнэ; '%' хост — хандалтыг security group хязгаарлана
    await conn.query(`CREATE USER IF NOT EXISTS ?@'%' IDENTIFIED BY ?${req}`, [user, pass]);
    await conn.query(`ALTER USER ?@'%' IDENTIFIED BY ?${req}`, [user, pass]);
    await conn.query("GRANT 'bmms_app' TO ?@'%'", [user]);
    await conn.query("SET DEFAULT ROLE ALL TO ?@'%'", [user]);
    console.log(`DB хэрэглэгч бэлэн: ${user} (bmms_app${ssl ? ', TLS заавал' : ''})`);
  } finally { await conn.end(); }
})().catch((e) => { console.error(`Алдаа: ${e.sqlMessage || e.message}`); process.exit(1); });
