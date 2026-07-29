'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * A very small data-fetching hook.
 *
 * Deliberately not TanStack Query. The screens here each load one list on mount
 * and refetch after a write; a cache layer would add a dependency and a set of
 * invalidation rules to solve a problem this application does not have yet.
 * When it does — background refetch, optimistic updates across screens — swap
 * this out, and nothing but this file changes.
 */
export interface QueryState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

export function useQuery<T>(fetcher: () => Promise<T>, deps: unknown[] = []): QueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetcher()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : 'טעינת הנתונים נכשלה.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, error, loading, reload };
}
