// API клиент.
//  - Access token зөвхөн санах ойд хадгалагдана (localStorage-д биш: XSS-ээр хулгайлагдах эрсдэл бага).
//  - Refresh token нь HttpOnly cookie тул JavaScript-ээс харагдахгүй.
//  - 401 ирвэл нэг удаа refresh хийж, хүсэлтийг давтана. Зэрэгцээ хүсэлтүүд нэг refresh-ийг хүлээнэ.
const BASE = import.meta.env.VITE_API_BASE || '/api/v1';

export class ApiError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.status = status; this.code = code; this.details = details;
  }
}

const NO_RETRY = new Set(['/auth/login', '/auth/refresh', '/auth/logout', '/auth/mfa/verify', '/auth/change-password',
  '/auth/password/forgot', '/auth/password/reset', '/auth/password/reset/check']);
let accessToken = null;
let refreshing = null;
let onAuthLost = () => {};
let onRestricted = () => {};
export const setAuthLostHandler = (fn) => { onAuthLost = fn; };
/** Сесс дунд admin нууц үг/MFA-г шинэчилбэл сервер 403 буцаана: профайлыг дахин ачаалж тохиргооны дэлгэц рүү шилжинэ */
export const setRestrictedHandler = (fn) => { onRestricted = fn; };
export const hasToken = () => !!accessToken;

async function parse(res) {
  if (res.status === 204) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const e = body && body.error;
    if (res.status === 403 && e && (e.code === 'PASSWORD_CHANGE_REQUIRED' || e.code === 'MFA_SETUP_REQUIRED')) onRestricted();
    throw new ApiError(res.status, (e && e.message) || 'Алдаа гарлаа. Дахин оролдоно уу', e && e.code, e && e.details);
  }
  return body;
}

export function refresh() {
  if (!refreshing) {
    refreshing = fetch(`${BASE}/auth/refresh`, {
      method: 'POST', credentials: 'include', headers: { 'X-Requested-With': 'bmms' },
    }).then(parse).then((j) => { accessToken = j.access_token; return true; })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

async function request(method, path, body, retried = false) {
  const headers = { 'X-Requested-With': 'bmms' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let res;
  try {
    res = await fetch(BASE + path, { method, headers, credentials: 'include', body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'Сервертэй холбогдож чадсангүй. Интернэт холболтоо шалгана уу');
  }
  if (res.status === 401 && !retried && !NO_RETRY.has(path)) {
    try { await refresh(); } catch { accessToken = null; onAuthLost(); throw new ApiError(401, 'Сесс дууссан. Дахин нэвтэрнэ үү'); }
    return request(method, path, body, true);
  }
  return parse(res);
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b = {}) => request('POST', p, b),
  put: (p, b) => request('PUT', p, b),
  patch: (p, b) => request('PATCH', p, b),
  del: (p) => request('DELETE', p),
  /** MFA идэвхтэй бол {mfa_token} буцаана, үгүй бол шууд нэвтэрнэ */
  async login(nevtreh_ner, nuuts_ug) {
    const j = await request('POST', '/auth/login', { nevtreh_ner, nuuts_ug });
    if (j.mfa_required) return { mfaToken: j.mfa_token };
    accessToken = j.access_token;
    return {};
  },
  async mfaVerify(mfa_token, kod) {
    const j = await request('POST', '/auth/mfa/verify', { mfa_token, kod });
    accessToken = j.access_token;
  },
  /** Нууц үг солисны дараа сервер бүх сессийг цуцалдаг */
  dropToken() { accessToken = null; },
  async logout() {
    try { await request('POST', '/auth/logout'); } finally { accessToken = null; }
  },
};

/** Query string бүтээх: undefined/null/'' утгыг алгасна */
export function qs(params) {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return p.length ? `?${new URLSearchParams(p).toString()}` : '';
}
