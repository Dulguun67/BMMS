import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, refresh, setAuthLostHandler, setRestrictedHandler } from '../api/client';

const Ctx = createContext(null);
const GROUP_KEY = 'bmms-group';

export function AuthProvider({ children }) {
  const [status, setStatus] = useState('loading'); // loading | anon | auth
  const [me, setMe] = useState(null);
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupIdState] = useState(() => {
    try { return Number(localStorage.getItem(GROUP_KEY)) || null; } catch { return null; }
  });

  const loadProfile = useCallback(async () => {
    const m = await api.get('/auth/me');
    // Нууц үг солих эсвэл MFA тохируулах шаардлагатай бол бусад API хаалттай (сервер 403 буцаана)
    const g = m.hyazgaarlalt ? [] : await api.get('/groups');
    setMe(m); setGroups(g); setStatus('auth');
  }, []);

  // Хуудас ачаалахад refresh cookie-гоор сессийг сэргээнэ
  useEffect(() => {
    setAuthLostHandler(() => { setMe(null); setStatus('anon'); });
    setRestrictedHandler(() => { loadProfile().catch(() => {}); });
    refresh().then(loadProfile).catch(() => setStatus('anon'));
  }, [loadProfile]);

  // MFA шаардлагатай бол {mfaToken} буцаана; нэвтрэх хуудас 2-р алхам руу шилжинэ
  const login = useCallback(async (email, pass) => {
    const r = await api.login(email, pass);
    if (r.mfaToken) return r;
    await loadProfile();
    return {};
  }, [loadProfile]);
  const verifyMfa = useCallback(async (token, code) => { await api.mfaVerify(token, code); await loadProfile(); }, [loadProfile]);
  const endSession = useCallback(() => { api.dropToken(); setMe(null); setGroups([]); setStatus('anon'); }, []);
  const logout = useCallback(async () => { try { await api.logout(); } finally { setMe(null); setGroups([]); setStatus('anon'); } }, []);

  const setGroupId = useCallback((id) => {
    setGroupIdState(id);
    try { localStorage.setItem(GROUP_KEY, String(id)); } catch { /* хувийн горим */ }
  }, []);

  // Сонгосон бүлэг жагсаалтад байхгүй бол хамгийн сүүлийн хичээлийн жилийн эхнийхийг сонгоно
  const group = useMemo(() => groups.find((g) => g.buleg_id === groupId) || groups[0] || null, [groups, groupId]);

  const value = useMemo(() => ({
    status, me, groups, group, setGroupId, login, verifyMfa, logout, endSession, reloadProfile: loadProfile,
    role: me ? me.uureg : null,
    isTeacher: !!me && me.uureg === 'bagsh',
    isMethod: !!me && me.uureg === 'arga_zuich',
    isAdmin: !!me && me.uureg === 'admin',
    canWrite: !!me && !!group && me.uureg === 'bagsh' && (group.bagsh_id === me.bagsh_id || group.tuslah_bagsh_id === me.bagsh_id),
  }), [status, me, groups, group, setGroupId, login, verifyMfa, logout, endSession, loadProfile]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
