import { createContext, useCallback, useContext, useRef, useState } from 'react';

const Ctx = createContext(() => {});
export function ToastProvider({ children }) {
  const [t, setT] = useState(null);
  const timer = useRef();
  const toast = useCallback((msg, kind = 'info') => {
    setT({ msg, kind });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setT(null), kind === 'error' ? 4500 : 2600);
  }, []);
  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className={`toast ${t ? 'on' : ''} ${t && t.kind === 'error' ? 'error' : ''}`} role="status" aria-live="polite">{t && t.msg}</div>
    </Ctx.Provider>
  );
}
export const useToast = () => useContext(Ctx);
