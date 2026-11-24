import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Calls `fn` now and every `ms` while the tab is visible; `refresh()` reloads at once.
 * A sequence number drops stale responses, so a slow old poll can't overwrite newer data.
 */
export function usePoll<T>(fn: (() => Promise<T>) | null, ms = 3000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);
  const enabled = fn !== null;

  const refresh = useCallback(async () => {
    const f = fnRef.current;
    if (!f) return;
    const mine = ++seq.current;
    try {
      const d = await f();
      if (mine === seq.current) { setData(d); setError(null); }
    } catch (e) {
      if (mine === seq.current) setError(e as Error);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const id = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, ms);
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [enabled, ms, refresh]);

  return { data, error, refresh, setData };
}
