import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';

/** Subscribes to a Dexie query and re-renders when the underlying tables change. */
export function useLiveQuery<T>(
  query: () => Promise<T>,
  deps: unknown[],
): { data: T | undefined; loading: boolean } {
  const [state, setState] = useState<{ data: T | undefined; loading: boolean }>({
    data: undefined,
    loading: true,
  });
  useEffect(() => {
    const sub = liveQuery(query).subscribe({
      next: (data) => setState({ data, loading: false }),
      error: (error) => {
        console.error('[offline] live query failed', error);
        setState({ data: undefined, loading: false });
      },
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
