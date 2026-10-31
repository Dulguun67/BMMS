'use strict';
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const pinoHttp = require('pino-http');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const { requireAuth } = require('./middleware/auth');
const { errorHandler, notFound } = require('./middleware/errors');

function createApp(cfg, log) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', cfg.TRUST_PROXY); // ALB-ийн X-Forwarded-For-оос жинхэнэ IP авна

  app.use(pinoHttp({
    logger: log,
    // Токен, cookie, нууц үг логт бичигдэхгүй
    redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    autoLogging: { ignore: (req) => req.url === '/health' },
  }));
  app.use(helmet());
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || cfg.CORS_ORIGINS.includes(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 600,
  }));
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());
  app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }); // хүүхдийн мэдээлэл кэшлэхгүй

  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.get('/ready', async (req, res) => {
    try { await db.ping(); res.json({ status: 'ready' }); } catch { res.status(503).json({ status: 'db_unavailable' }); }
  });

  const api = express.Router();
  api.use(rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: { code: 'RATE_LIMIT', message: 'Хэт олон хүсэлт. Түр хүлээнэ үү' } } }));
  api.use('/auth', require('./routes/auth')(cfg));
  api.use('/auth', require('./routes/passwordReset').router());
  api.use(requireAuth);
  api.use(require('./routes/admin')(cfg));
  api.use(require('./routes/children')(cfg));
  api.use(require('./routes/registers')());
  api.use(require('./routes/assessment')());
  api.use(require('./routes/workflow')());
  api.use(require('./routes/individual')());
  app.use('/api/v1', api);

  app.use((req, res, next) => next(notFound('Хаяг олдсонгүй')));
  app.use(errorHandler(log));
  return app;
}

module.exports = { createApp };
