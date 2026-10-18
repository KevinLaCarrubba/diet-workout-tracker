import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserId } from '@/features/auth/useAuth';
import { supabase, unwrap } from '@/lib/supabase';
import { db } from '@/offline/db';
import { isNetworkError } from '@/offline/syncEngine';
import { useLiveQuery } from '@/offline/useLiveQuery';
import { withOfflineCache } from '../api';
import {
  mergeHistory,
  serverToDetail,
  serverToHistoryItem,
  type HistoryItem,
  type ServerSessionDetail,
  type ServerSessionRow,
  type SessionDetail,
} from './historyModel';

export const PAGE_SIZE = 20;

export const historyKeys = {
  list: (userId: string) => ['workouts', 'history', userId] as const,
  detail: (sessionId: string) => ['workouts', 'history', 'detail', sessionId] as const,
};

async function fetchHistoryPage(userId: string, page: number): Promise<HistoryItem[]> {
  const load = async () => {
    const from = page * PAGE_SIZE;
    const rows = unwrap(
      await supabase
        .from('workout_sessions')
        .select(
          'id, title, started_at, duration_seconds, total_sets, total_volume_kg, personal_records(count)',
        )
        .eq('user_id', userId)
        .eq('status', 'completed')
        .order('started_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1),
    );
    return (rows as unknown as ServerSessionRow[]).map(serverToHistoryItem);
  };
  // The first page is kept on the device so history opens offline.
  return page === 0 ? withOfflineCache(`history:${userId}`, load) : load();
}

/** Ids of workouts whose upload is still queued on this device. */
function usePendingSessionIds() {
  return useLiveQuery(
    async () =>
      new Set(
        (await db.outbox.where('kind').equals('workout_session').toArray()).map((i) =>
          i.key.slice('workout_session:'.length),
        ),
      ),
    [],
  );
}

/** Completed workouts newest first, including finished ones not uploaded yet. */
export function useHistory() {
  const userId = useUserId();
  const query = useInfiniteQuery({
    queryKey: historyKeys.list(userId),
    queryFn: ({ pageParam }) => fetchHistoryPage(userId, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.length === PAGE_SIZE ? all.length : undefined),
  });
  const drafts = useLiveQuery(
    () =>
      db.sessions
        .where('user_id')
        .equals(userId)
        .filter((s) => s.status === 'completed')
        .toArray(),
    [userId],
  );
  const pending = usePendingSessionIds();
  const server = query.data?.pages.flat() ?? [];
  const items = mergeHistory(server, drafts.data ?? [], pending.data ?? new Set());
  return { query, items, localLoading: drafts.loading || pending.loading };
}

export function useServerSessionDetail(sessionId: string | undefined) {
  return useQuery({
    queryKey: historyKeys.detail(sessionId ?? ''),
    enabled: !!sessionId,
    queryFn: async (): Promise<SessionDetail | null> =>
      withOfflineCache(`session:${sessionId}`, async () => {
        const row = unwrap(
          await supabase
            .from('workout_sessions')
            .select('*, exercises:workout_session_exercises(*, sets:workout_sets(*))')
            .eq('id', sessionId!)
            .maybeSingle(),
        );
        if (!row) return null;
        const records = unwrap(
          await supabase
            .from('personal_records')
            .select('exercise_id, record_type, value, weight_kg, reps')
            .eq('source_session_id', sessionId!),
        );
        return serverToDetail(row as unknown as ServerSessionDetail, records);
      }),
  });
}

/** The device draft for a session (live) and whether its upload is still queued. */
export function useLocalSession(sessionId: string | undefined) {
  return useLiveQuery(async () => {
    if (!sessionId) return { draft: undefined, pending: false };
    const [draft, item] = await Promise.all([
      db.sessions.get(sessionId),
      db.outbox.get(`workout_session:${sessionId}`),
    ]);
    return { draft, pending: !!item };
  }, [sessionId]);
}

async function forgetLocally(sessionId: string) {
  await db.transaction('rw', db.sessions, db.outbox, db.cache, async () => {
    await db.outbox.delete(`workout_session:${sessionId}`);
    await db.sessions.delete(sessionId);
    await db.cache.delete(`session:${sessionId}`);
  });
}

/**
 * Deletes a workout everywhere (sets, exercises and its records cascade).
 * Offline, a workout that never left this device is simply forgotten here.
 */
export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, source }: { id: string; source: SessionDetail['source'] }) => {
      try {
        unwrap(await supabase.from('workout_sessions').delete().eq('id', id));
      } catch (error) {
        if (!(source === 'device' && (!navigator.onLine || isNetworkError(error)))) throw error;
      }
      await forgetLocally(id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workouts'] }),
  });
}
