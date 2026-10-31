'use strict';
// БММС өгөгдлийн сангийн migration.
//   node scripts/migrate.js            — хүлээгдэж буй migration-ыг дарааллаар ажиллуулна
//   node scripts/migrate.js --status   — төлөвийг харуулна
//   node scripts/migrate.js --seed db/seeds/demo_data.sql   — нэг SQL файл ажиллуулна (зөвхөн туршилтын орчинд)
//
// Файлын нэр Flyway-ийн дүрэмтэй ижил (V<дугаар>__<тайлбар>.sql), тиймээс шаардлагатай бол
// Flyway руу шилжиж болно. Ажилласан migration-ыг өөрчилбөл checksum таарахгүй гэж зогсоно.
//
// Холболт: MIGRATE_DB_USER / MIGRATE_DB_PASSWORD (DDL, CREATE ROLE эрхтэй, жишээ нь RDS master),
// бусад нь API-ийн DB_HOST, DB_PORT, DB_NAME, DB_SSL_CA. API-ийн bmms_app хэрэглэгч DDL эрхгүй.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

const DIR = process.env.MIGRATIONS_DIR || path.join(__dirname, '..', 'db', 'migrations');
const RX = /^V(\d+)__([\w-]+)\.sql$/;

/** SQL файлыг statement-уудад хуваана: DELIMITER, мөр ба блок тайлбар, хашилтын дотрыг хүндэтгэнэ */
function splitSql(sql) {
  const out = [];
  let delim = ';';
  let buf = '';
  let i = 0;
  const n = sql.length;
  const atLineStart = () => buf.trim() === '';
  while (i < n) {
    // DELIMITER команд (мөрийн эхэнд, statement эхлээгүй үед)
    if (atLineStart() && /^DELIMITER\s/i.test(sql.slice(i, i + 10)) && (i === 0 || sql[i - 1] === '\n')) {
      const end = sql.indexOf('\n', i);
      const line = sql.slice(i, end === -1 ? n : end).trim();
      delim = line.split(/\s+/)[1];
      buf = '';
      i = end === -1 ? n : end + 1;
      continue;
    }
    const c = sql[i];
    const two = sql.slice(i, i + 2);
    if (two === '--' || c === '#') { const end = sql.indexOf('\n', i); i = end === -1 ? n : end + 1; buf += '\n'; continue; }
    if (two === '/*') { const end = sql.indexOf('*/', i + 2); i = end === -1 ? n : end + 2; buf += ' '; continue; }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === '\\' && c !== '`') { j += 2; continue; }
        if (sql[j] === c) { if (sql[j + 1] === c) { j += 2; continue; } break; }
        j++;
      }
      buf += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (sql.startsWith(delim, i)) {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
      i += delim.length;
      continue;
    }
    buf += c;
    i++;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function listMigrations() {
  return fs.readdirSync(DIR).filter((f) => RX.test(f)).map((f) => {
    const [, v, d] = RX.exec(f);
    const body = fs.readFileSync(path.join(DIR, f), 'utf8');
    return { version: Number(v), description: d.replace(/_/g, ' '), file: f, body, checksum: crypto.createHash('sha256').update(body).digest('hex') };
  }).sort((a, b) => a.version - b.version);
}

async function connect(withDb) {
  const e = process.env;
  const name = e.DB_NAME || 'bmms';
  if (!/^\w+$/.test(name)) throw new Error('DB_NAME буруу');
  const conn = await mysql.createConnection({
    host: e.DB_HOST || '127.0.0.1', port: Number(e.DB_PORT || 3306),
    user: e.MIGRATE_DB_USER, password: e.MIGRATE_DB_PASSWORD, database: withDb ? name : undefined,
    charset: 'UTF8MB4_0900_AI_CI', multipleStatements: false, dateStrings: true,
    ssl: e.DB_SSL_CA ? { ca: fs.readFileSync(e.DB_SSL_CA), rejectUnauthorized: true } : undefined,
  });
  await conn.query('SET NAMES utf8mb4 COLLATE utf8mb4_0900_as_ci');
  return { conn, name };
}

async function runFile(conn, body) {
  for (const stmt of splitSql(body)) await conn.query(stmt);
}

async function main() {
  const args = process.argv.slice(2);
  if (!process.env.MIGRATE_DB_USER) throw new Error('MIGRATE_DB_USER заана уу');
  // Өгөгдлийн сан байхгүй бол зөв collation-тай үүсгэнэ (V1-ийн хүснэгтүүд үүнийг өвлөнө)
  const boot = await connect(false);
  await boot.conn.query(`CREATE DATABASE IF NOT EXISTS \`${boot.name}\` DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_0900_as_ci`);
  await boot.conn.end();

  const { conn } = await connect(true);
  try {
    if (args[0] === '--seed') {
      const f = args[1];
      if (!f) throw new Error('--seed <файл>');
      if (process.env.NODE_ENV === 'production') throw new Error('Production орчинд seed ажиллуулахгүй');
      await runFile(conn, fs.readFileSync(f, 'utf8'));
      console.log(`seed: ${f}`);
      return;
    }
    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INT UNSIGNED PRIMARY KEY, description VARCHAR(200) NOT NULL, checksum CHAR(64) NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, duration_ms INT UNSIGNED NOT NULL) ENGINE=InnoDB`);
    const [applied] = await conn.query('SELECT version, checksum FROM schema_migrations ORDER BY version');
    const done = new Map(applied.map((r) => [r.version, r.checksum]));
    const all = listMigrations();
    for (const m of all) {
      if (done.has(m.version) && done.get(m.version) !== m.checksum) {
        throw new Error(`V${m.version} ажилласны дараа өөрчлөгдсөн байна (checksum таарахгүй). Шинэ migration нэмнэ үү`);
      }
    }
    if (args[0] === '--status') {
      for (const m of all) console.log(`${done.has(m.version) ? 'applied' : 'pending'}  V${m.version}  ${m.description}`);
      return;
    }
    const pending = all.filter((m) => !done.has(m.version));
    if (!pending.length) { console.log('Шинэ migration алга.'); return; }
    // Нэгэн зэрэг хоёр migration ажиллахаас сэргийлнэ (жишээ нь ECS-ийн хоёр task)
    const [[lock]] = await conn.query("SELECT GET_LOCK('bmms_migrate', 30) AS ok");
    if (!lock.ok) throw new Error('Өөр migration ажиллаж байна');
    try {
      for (const m of pending) {
        const t = Date.now();
        process.stdout.write(`V${m.version} ${m.description} ... `);
        // MySQL-д DDL transaction-гүй тул алдаа гарвал зогсоод гараар засна; амжилттай бол бүртгэнэ
        await runFile(conn, m.body);
        await conn.query('INSERT INTO schema_migrations (version, description, checksum, duration_ms) VALUES (?, ?, ?, ?)',
          [m.version, m.description, m.checksum, Date.now() - t]);
        console.log(`ok (${Date.now() - t} ms)`);
      }
    } finally { await conn.query("SELECT RELEASE_LOCK('bmms_migrate')"); }
  } finally { await conn.end(); }
}

if (require.main === module) main().catch((e) => { console.error(`\nАлдаа: ${e.sqlMessage || e.message}`); process.exit(1); });
module.exports = { splitSql, connect };
