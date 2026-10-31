import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './client';

/** GET хүсэлт. path=null бол хүсэлт явуулахгүй. reload() дахин татна. */
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: !!path });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) { setState({ data: null, error: null, loading: false }); return undefined; }
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    api.get(path).then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (error) => alive && setState({ data: null, error, loading: false }),
    );
    return () => { alive = false; };
  }, [path, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const mutate = useCallback((fn) => setState((s) => ({ ...s, data: fn(s.data) })), []);
  return { ...state, reload, mutate };
}

/** Үйлдэл (POST/PUT...) хийх: busy төлөв, алдааг toast-оор харуулна */
export function useAction(toast) {
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const run = useCallback(async (fn, okMsg) => {
    setBusy(true);
    try {
      const r = await fn();
      if (okMsg) toast(okMsg);
      return r;
    } catch (e) {
      toast(e.message, 'error');
      throw e;
    } finally { if (mounted.current) setBusy(false); }
  }, [toast]);
  return [run, busy];
}
