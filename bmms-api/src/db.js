'use strict';
const fs = require('fs');
const mysql = require('mysql2/promise');

let pool;

function init(cfg) {
  pool = mysql.createPool({
    host: cfg.DB_HOST,
    port: cfg.DB_PORT,
    user: cfg.DB_USER,
    password: cfg.DB_PASSWORD,
    database: cfg.DB_NAME,
    connectionLimit: cfg.DB_POOL_SIZE,
    charset: 'UTF8MB4_0900_AI_CI',
    dateStrings: true,          // DATE/DATETIME-ийг цагийн бүсээр хөрвүүлэхгүй
    decimalNumbers: true,
    supportBigNumbers: true,
    multipleStatements: false,  // SQL injection гарсан ч олон query ажиллуулахгүй
    ssl: cfg.DB_SSL_CA ? { ca: fs.readFileSync(cfg.DB_SSL_CA), rejectUnauthorized: true } : undefined,
  });
  // Ё/Е, Ө/О-г ялгадаг collation (өгөгдлийн сангийн багануудтай ижил)
  pool.pool.on('connection', (conn) => {
    conn.query('SET NAMES utf8mb4 COLLATE utf8mb4_0900_as_ci');
  });
  return pool;
}

/**
 * Нэг холболт авч @app_hereglegch_id-г тохируулаад fn-г ажиллуулна.
 * Аудитын trigger энэ хувьсагчаар хэн хийснийг тодорхойлно.
 * Pool-д буцаахын өмнө хувьсагчийг цэвэрлэнэ.
 */
async function run(actorId, fn) {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET @app_hereglegch_id = ?', [actorId ?? null]);
    return await fn(conn);
  } finally {
    try { await conn.query('SET @app_hereglegch_id = NULL'); } catch { /* холболт тасарсан */ }
    conn.release();
  }
}

/** run + transaction. Дотор нь өөрийн transaction-тай процедур (sp_batlah_urgal) дуудахгүй. */
async function tx(actorId, fn) {
  return run(actorId, async (conn) => {
    await conn.beginTransaction();
    try {
      const r = await fn(conn);
      await conn.commit();
      return r;
    } catch (e) {
      await conn.rollback();
      throw e;
    }
  });
}

async function q(conn, sql, params) {
  const [rows] = await conn.query(sql, params);
  return rows;
}
async function one(conn, sql, params) {
  const rows = await q(conn, sql, params);
  return rows[0];
}

async function ping() {
  const [r] = await pool.query('SELECT 1 AS ok');
  return r[0].ok === 1;
}

async function close() { if (pool) await pool.end(); }

module.exports = { init, run, tx, q, one, ping, close };
