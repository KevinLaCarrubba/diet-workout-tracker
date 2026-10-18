import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import { syncHandlers } from './handlers';
import { startSyncEngine } from './syncEngine';
import type { OutboxKind } from './types';

const invalidates: Record<OutboxKind, string[]> = {
  workout_session: ['workouts'],
  cardio_session: ['cardio'],
  delete_cardio_session: ['cardio'],
  water_log: ['water'],
  delete_water_log: ['water'],
};

/** Runs the outbound sync engine for the signed-in user. */
export function SyncProvider() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    const engine = startSyncEngine({
      userId,
      handlers: syncHandlers,
      onSynced: (kinds) => {
        for (const kind of kinds)
          for (const key of invalidates[kind]) qc.invalidateQueries({ queryKey: [key] });
      },
    });
    return () => engine.stop();
  }, [userId, qc]);

  return null;
}
