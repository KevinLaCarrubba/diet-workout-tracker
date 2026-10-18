import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserId } from '@/features/auth/useAuth';
import { supabase, unwrap } from '@/lib/supabase';
import type { Enums } from '@/types/database';
import { workoutKeys } from '../api';
import { summarizeHistory, type HistoryRow } from './helpers';

export const exerciseKeys = {
  history: (userId: string, exerciseId: string) =>
    ['workouts', 'exercise-history', userId, exerciseId] as const,
};

export interface ExerciseValues {
  name: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  equipment: string | null;
  instructions: string | null;
  difficulty: Enums<'exercise_difficulty'>;
  is_bodyweight: boolean;
}

/** Creates (no id) or updates (id) one of the user's own exercises. */
export function useSaveExercise() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: ExerciseValues }) => {
      if (id) {
        return unwrap(
          await supabase
            .from('exercises')
            .update(values)
            .eq('id', id)
            .eq('owner_user_id', userId)
            .select()
            .single(),
        );
      }
      return unwrap(
        await supabase
          .from('exercises')
          .insert({ ...values, owner_user_id: userId })
          .select()
          .single(),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workoutKeys.all }),
  });
}

export function useDeleteExercise() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(await supabase.from('exercises').delete().eq('id', id).eq('owner_user_id', userId)),
    onSuccess: () => qc.invalidateQueries({ queryKey: workoutKeys.all }),
  });
}

/** The user's last five completed sessions that included this exercise. */
export function useExerciseHistory(exerciseId: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: exerciseKeys.history(userId, exerciseId),
    queryFn: async () => {
      const rows = unwrap(
        await supabase
          .from('workout_session_exercises')
          .select(
            'id, rep_mode, session:workout_sessions!inner(id, started_at, title, status), sets:workout_sets(id, sort_order, weight_kg, reps, duration_seconds, is_warmup, completed_at)',
          )
          .eq('user_id', userId)
          .eq('exercise_id', exerciseId)
          .eq('session.status', 'completed'),
      );
      return summarizeHistory(rows as unknown as HistoryRow[]);
    },
  });
}
