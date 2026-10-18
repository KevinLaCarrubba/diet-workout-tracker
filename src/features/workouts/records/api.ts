import { useQuery } from '@tanstack/react-query';
import { useUserId } from '@/features/auth/useAuth';
import { supabase, unwrap } from '@/lib/supabase';
import { withOfflineCache } from '../api';
import { progressionFromRows, type PersonalRecordRow, type ProgressionRow } from './recordsModel';

export const recordKeys = {
  all: (userId: string) => ['workouts', 'records', userId] as const,
  progression: (userId: string, exerciseId: string) =>
    ['workouts', 'records', userId, 'progression', exerciseId] as const,
};

/** The full personal-record log (small: a handful of rows per workout). */
export function usePersonalRecords() {
  const userId = useUserId();
  return useQuery({
    queryKey: recordKeys.all(userId),
    queryFn: () =>
      withOfflineCache(`records:${userId}`, async () => {
        const rows = unwrap(
          await supabase
            .from('personal_records')
            .select(
              'id, exercise_id, record_type, value, weight_kg, reps, achieved_at, source_session_id, exercise:exercises(name)',
            )
            .eq('user_id', userId)
            .order('achieved_at', { ascending: false })
            .limit(5000),
        );
        return rows as unknown as PersonalRecordRow[];
      }),
  });
}

/** Estimated 1RM per completed session for one exercise, oldest first. */
export function useStrengthProgression(exerciseId: string | null) {
  const userId = useUserId();
  return useQuery({
    queryKey: recordKeys.progression(userId, exerciseId ?? ''),
    enabled: !!exerciseId,
    queryFn: async () => {
      const rows = unwrap(
        await supabase
          .from('workout_session_exercises')
          .select(
            'session:workout_sessions!inner(id, started_at, status), sets:workout_sets(weight_kg, reps, is_warmup, completed_at)',
          )
          .eq('user_id', userId)
          .eq('exercise_id', exerciseId!)
          .eq('session.status', 'completed')
          .limit(1000),
      );
      return progressionFromRows(rows as unknown as ProgressionRow[]);
    },
  });
}
