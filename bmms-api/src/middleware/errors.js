'use strict';

class HttpError extends Error {
  constructor(status, message, code = 'ERROR', details) {
    super(message);
    this.status = status; this.code = code; this.details = details;
  }
}
const badRequest = (m, d) => new HttpError(400, m, 'BAD_REQUEST', d);
const unauthorized = (m = 'Нэвтрэх шаардлагатай') => new HttpError(401, m, 'UNAUTHORIZED');
const forbidden = (m = 'Энэ үйлдлийг хийх эрхгүй') => new HttpError(403, m, 'FORBIDDEN');
const notFound = (m = 'Олдсонгүй') => new HttpError(404, m, 'NOT_FOUND');
const conflict = (m) => new HttpError(409, m, 'CONFLICT');
const unprocessable = (m, d) => new HttpError(422, m, 'VALIDATION', d);

/** async handler-ийн алдааг Express-д дамжуулна */
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// MySQL-ийн алдааг хэрэглэгчид ойлгомжтой болгоно. Хүснэгт, баганын нэр задруулахгүй.
function mapDbError(err) {
  switch (err.errno) {
    case 1644: return new HttpError(422, err.sqlMessage, 'RULE'); // trigger/процедурын SIGNAL (монгол мессеж)
    case 1062: return new HttpError(409, 'Ийм бичлэг аль хэдийн бүртгэгдсэн байна', 'DUPLICATE');
    case 3819: {
      const m = /'([^']+)'/.exec(err.sqlMessage || '');
      return new HttpError(422, 'Утга шаардлага хангахгүй байна', 'CHECK', { constraint: m && m[1] });
    }
    case 1452: return new HttpError(422, 'Холбогдох бичлэг олдсонгүй', 'REFERENCE');
    case 1451: return new HttpError(409, 'Холбоотой бичлэг байгаа тул устгах боломжгүй', 'IN_USE');
    case 1265: case 1366: case 1292: return new HttpError(422, 'Утгын төрөл буруу', 'VALUE');
    default: return null;
  }
}

function errorHandler(log) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    let e = err instanceof HttpError ? err : mapDbError(err);
    if (e && e.code === 'INTEGRITY') (req.log || log).warn({ details: e.details, url: req.originalUrl }, 'security: data integrity failure');
    if (!e && err.type === 'entity.parse.failed') e = badRequest('JSON буруу байна');
    if (!e && err.type === 'entity.too.large') e = new HttpError(413, 'Хүсэлт хэт том байна', 'TOO_LARGE');
    if (!e) {
      (req.log || log).error({ err }, 'unhandled');
      e = new HttpError(500, 'Дотоод алдаа гарлаа', 'INTERNAL');
    }
    res.status(e.status).json({ error: { code: e.code, message: e.message, details: e.details } });
  };
}

module.exports = { HttpError, badRequest, unauthorized, forbidden, notFound, conflict, unprocessable, h, errorHandler };
