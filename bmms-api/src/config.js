'use strict';
// Орчны хувьсагчийг эхлүүлэхэд шалгана. Алдаатай бол сервер асахгүй (fail fast).
const { z } = require('zod');

// zod 4: default() нь transform-ийн гаралтын төрөлтэй тул эхлээд default, дараа нь transform
const bool = (def) => z.enum(['true', 'false']).default(def).transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(8080),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1), // ALB-ийн ард 1

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().default(3306),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_NAME: z.string().default('bmms'),
  DB_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  DB_SSL_CA: z.string().optional(), // RDS CA bundle-ийн зам. Production-д заавал

  JWT_SECRET: z.string().min(32, 'JWT_SECRET хамгийн багадаа 32 тэмдэгт байна'),
  JWT_ISSUER: z.string().default('bmms-api'),
  JWT_AUDIENCE: z.string().default('bmms-web'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  COOKIE_SECURE: bool('true'),

  CORS_ORIGINS: z.string().default(''), // таслалаар тусгаарласан
  LOGIN_MAX_FAILS: z.coerce.number().int().min(3).default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).default(15),
  LOGIN_RATE_LIMIT: z.coerce.number().int().min(1).default(10), // IP тус бүрд 15 минутад
  PASSWORD_MIN_LENGTH: z.coerce.number().int().min(10).default(12),

  // *_enc баганын шифрлэлтийн түлхүүрүүд: {"k2026a":"<base64 32 байт>"}
  // Production-д Secrets Manager-ээс ECS task-д орчны хувьсагчаар дамжуулна.
  FIELD_KEYS: z.string().min(2),
  FIELD_KEY_ACTIVE: z.string().min(1),

  // Хоёр шатлалт баталгаажуулалт: эдгээр үүрэгт заавал (таслалаар). Хоосон бол хэнд ч заавал биш.
  MFA_REQUIRED_ROLES: z.string().default('arga_zuich,admin'),
  MFA_ISSUER: z.string().default('BMMS'),
  // Нөөц кодын HMAC түлхүүр (openssl rand -hex 32). Солибол одоо байгаа нөөц кодууд хүчингүй болно.
  MFA_PEPPER: z.string().min(32, 'MFA_PEPPER хамгийн багадаа 32 тэмдэгт'),
  IMPORT_MAX_ROWS: z.coerce.number().int().min(1).max(1000).default(300),

  // Имэйл (нууц үг сэргээх). Production-д ses заавал.
  MAIL_PROVIDER: z.enum(['ses', 'console', 'memory']).default('console'),
  MAIL_FROM: z.string().default('БММС <no-reply@localhost>'),
  AWS_REGION: z.string().default('ap-northeast-2'),
  SES_CONFIGURATION_SET: z.string().optional(),
  APP_URL: z.string().url().default('http://localhost:5173'), // сэргээх холбоосын frontend хаяг
  PASSWORD_RESET_TTL_MIN: z.coerce.number().int().min(10).max(120).default(30),
  PASSWORD_RESET_PER_HOUR: z.coerce.number().int().min(1).max(10).default(3),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

function load(env = process.env) {
  const r = schema.safeParse(env);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Тохиргооны алдаа: ${msg}`);
  }
  const c = r.data;
  let keys;
  try { keys = JSON.parse(c.FIELD_KEYS); } catch { throw new Error('FIELD_KEYS JSON биш байна'); }
  for (const [kid, b64] of Object.entries(keys)) {
    if (Buffer.from(b64, 'base64').length !== 32) throw new Error(`FIELD_KEYS.${kid} 32 байт биш байна`);
  }
  if (!keys[c.FIELD_KEY_ACTIVE]) throw new Error('FIELD_KEY_ACTIVE нь FIELD_KEYS-д байхгүй');
  if (c.NODE_ENV === 'production') {
    if (!c.DB_SSL_CA) throw new Error('Production орчинд DB_SSL_CA (TLS) заавал');
    if (!c.COOKIE_SECURE) throw new Error('Production орчинд COOKIE_SECURE=true байна');
    if (!c.CORS_ORIGINS) throw new Error('Production орчинд CORS_ORIGINS заавал');
    if (c.MAIL_PROVIDER !== 'ses') throw new Error('Production орчинд MAIL_PROVIDER=ses байна (сэргээх холбоос логт бичигдэхгүй)');
    if (!c.APP_URL.startsWith('https://')) throw new Error('Production орчинд APP_URL https байна');
  }
  const roles = c.MFA_REQUIRED_ROLES.split(',').map((x) => x.trim()).filter(Boolean);
  if (roles.some((x) => !['bagsh', 'arga_zuich', 'admin'].includes(x))) throw new Error('MFA_REQUIRED_ROLES буруу');
  return { ...c, MFA_REQUIRED_ROLES: roles, FIELD_KEYS: keys, CORS_ORIGINS: c.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean) };
}

module.exports = { load };
