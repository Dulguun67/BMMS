'use strict';
const pino = require('pino');
const config = require('./config');
const db = require('./db');
const tokens = require('./security/tokens');
const fieldCrypto = require('./security/fieldCrypto');
const authMw = require('./middleware/auth');
const mailer = require('./mail/mailer');
const passwordReset = require('./routes/passwordReset');
const { createApp } = require('./app');

function bootstrap(env = process.env) {
  const cfg = config.load(env);
  const log = pino({ level: cfg.LOG_LEVEL, base: { svc: 'bmms-api' } });
  db.init(cfg);
  tokens.init(cfg);
  fieldCrypto.init(cfg);
  authMw.init(cfg);
  mailer.init(cfg);
  passwordReset.init(cfg);
  return { cfg, log, app: createApp(cfg, log) };
}

if (require.main === module) {
  let started;
  try { started = bootstrap(); } catch (e) { console.error(e.message); process.exit(1); }
  const { cfg, log, app } = started;
  const server = app.listen(cfg.PORT, () => log.info({ port: cfg.PORT, env: cfg.NODE_ENV }, 'БММС API ажиллаж байна'));
  // ECS task зогсоход (SIGTERM) идэвхтэй хүсэлтүүдийг дуусгаад хаана
  const shutdown = (sig) => {
    log.info({ sig }, 'зогсож байна');
    server.close(async () => { await db.close(); process.exit(0); });
    setTimeout(() => process.exit(1), 15000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = { bootstrap };
