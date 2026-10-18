import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUserId } from '@/features/auth/useAuth';
import { supabase, unwrap } from '@/lib/supabase';
import { db } from '@/offline/db';
import type { CardioPayload } from '@/offline/handlers';
import { enqueue } from '@/offline/outbox';
import { useLiveQuery } from '@/offline/useLiveQuery';
import { withOfflineCache } from '../api';
import {
  mergeCardio,
  payloadToRow,
  removeFromPages,
  upsertIntoPages,
  type CardioRow,
  type Pages,
} from './cardioModel';

export const CARDIO_PAGE_SIZE = 50;

export const cardioKeys = {
  list: (userId: string) => ['cardio', 'list', userId] as const,
};

async function fetchCardioPage(userId: string, page: number): Promise<CardioRow[]> {
  const load = async () => {
    const from = page * CARDIO_PAGE_SIZE;
    return unwrap(
      await supabase
        .from('cardio_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('occurred_at', { ascending: false })
        .range(from, from + CARDIO_PAGE_SIZE - 1),
    );
  };
  return page === 0 ? withOfflineCache(`cardio:${userId}`, load) : load();
}

/** Server cardio list merged with saves/deletes still queued on this device. */
export function useCardioSessions() {
  const userId = useUserId();
  const query = useInfiniteQuery({
    queryKey: cardioKeys.list(userId),
    queryFn: ({ pageParam }) => fetchCardioPage(userId, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.length === CARDIO_PAGE_SIZE ? all.length : undefined),
  });
  const outbox = useLiveQuery(
    () =>
      db.outbox
        .where('kind')
        .anyOf('cardio_session', 'delete_cardio_session')
        .filter((i) => i.user_id === userId)
        .toArray(),
    [userId],
  );
  const items = mergeCardio(query.data?.pages.flat() ?? [], outbox.data ?? []);
  return { query, items, localLoading: outbox.loading };
}

/** Saves (new or edited) cardio on the device first; it uploads when online. */
export function useSaveCardio() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: CardioPayload) => {
      await enqueue('cardio_session', row.id, userId, row);
      return row;
    },
    onSuccess: (row) => {
      qc.setQueryData<Pages<CardioRow>>(cardioKeys.list(userId), (data) =>
        upsertIntoPages(data, payloadToRow(row)),
      );
    },
  });
}

export function useDeleteCardio() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await db.transaction('rw', db.outbox, async () => {
        // A save that never uploaded doesn't need to.
        await db.outbox.delete(`cardio_session:${id}`);
      });
      await enqueue('delete_cardio_session', id, userId, { id });
      return id;
    },
    onSuccess: (id) => {
      qc.setQueryData<Pages<CardioRow>>(cardioKeys.list(userId), (data) => removeFromPages(data, id));
    },
  });
}
