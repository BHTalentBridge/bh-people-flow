import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Keeps typing responsive while the table query trails behind. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * Filter state lives in the URL so a filtered view is shareable and survives a
 * refresh — and so notification deep-links like /invoices?status=SUBMITTED work.
 */
export function useQueryState(defaults: Record<string, string> = {}) {
  const [params, setParams] = useSearchParams();

  const state = useMemo(() => {
    const out: Record<string, string> = { ...defaults };
    params.forEach((v, k) => (out[k] = v));
    return out;
  }, [params, JSON.stringify(defaults)]);

  const set = (patch: Record<string, string | number | undefined | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') next.delete(k);
      else next.set(k, String(v));
    });
    // Any filter change resets to the first page.
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  const reset = () => setParams(new URLSearchParams(), { replace: true });

  return { state, set, reset, params };
}

/** Cleans a filter object into query params, dropping empties. */
export function clean(obj: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );
}
