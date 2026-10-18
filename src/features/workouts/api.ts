import { useQuery } from '@tanstack/react-query';
import { useUserId } from '@/features/auth/useAuth';
import { supabase, unwrap } from '@/lib/supabase';
import { readCache, writeCache } from '@/offline/db';
import { withOfflineCache } from '@/offline/withOfflineCache';
import { isNetworkError } from '@/offline/syncEngine';
import type { PreviousSet } from '@/offline/types';
import type { Tables } from '@/types/database';
import type { PlannedExercise } from './session/draft';

export type Exercise = Tables<'exercises'>;
export type WorkoutTemplate = Tables<'workout_templates'>;
export type TemplateExercise = Tables<'workout_template_exercises'> & { exercise: Exercise };
export type TemplateWithExercises = WorkoutTemplate & { items: TemplateExercise[] };

/** All workout queries live under ['workouts'] so a finished sync refreshes them. */
export const workoutKeys = {
  all: ['workouts'] as const,
  exercises: (userId: string) => ['workouts', 'exercises', userId] as const,
  templates: (userId: string) => ['workouts', 'templates', userId] as const,
  sharedPlans: () => ['workouts', 'shared-plans'] as const,
  previous: (userId: string, ids: string[]) => ['workouts', 'previous', userId, ...ids] as const,
};

export { withOfflineCache };

export async function fetchExercises(userId: string): Promise<Exercise[]> {
  return withOfflineCache(`exercises:${userId}`, async () => {
    // Shared catalog is a separate request so the service worker can cache it safely.
    const [shared, own] = await Promise.all([
      supabase.from('exercises').select('*').is('owner_user_id', null).order('name'),
      supabase.from('exercises').select('*').eq('owner_user_id', userId).order('name'),
    ]);
    return [...unwrap(own), ...unwrap(shared)].sort((a, b) => a.name.localeCompare(b.name));
  });
}

export function useExercises() {
  const userId = useUserId();
  return useQuery({
    queryKey: workoutKeys.exercises(userId),
    queryFn: () => fetchExercises(userId),
    staleTime: 5 * 60_000,
  });
}

const TEMPLATE_SELECT =
  '*, items:workout_template_exercises(*, exercise:exercises!workout_template_exercises_exercise_id_fkey(*))';

function sortItems(templates: TemplateWithExercises[]) {
  return templates.map((t) => ({ ...t, items: [...t.items].sort((a, b) => a.sort_order - b.sort_order) }));
}

export async function fetchTemplates(userId: string): Promise<TemplateWithExercises[]> {
  return withOfflineCache(`templates:${userId}`, async () => {
    const rows = unwrap(
      await supabase
        .from('workout_templates')
        .select(TEMPLATE_SELECT)
        .eq('user_id', userId)
        .is('archived_at', null)
        .order('created_at'),
    );
    return sortItems(rows as unknown as TemplateWithExercises[]);
  });
}

export function useTemplates() {
  const userId = useUserId();
  return useQuery({ queryKey: workoutKeys.templates(userId), queryFn: () => fetchTemplates(userId) });
}

/** Example plans everyone can copy (Push/Pull/Legs, Upper/Lower, Full Body). */
export function useSharedPlans() {
  return useQuery({
    queryKey: workoutKeys.sharedPlans(),
    queryFn: async () => {
      const rows = unwrap(
        await supabase
          .from('workout_templates')
          .select(TEMPLATE_SELECT)
          .is('user_id', null)
          .order('plan_name')
          .order('title'),
      );
      return sortItems(rows as unknown as TemplateWithExercises[]);
    },
    staleTime: 60 * 60_000,
  });
}

/** Last completed working sets per exercise, cached per exercise for offline use. */
export async function fetchPreviousPerformance(
  exerciseIds: string[],
): Promise<Record<string, PreviousSet[]>> {
  const ids = [...new Set(exerciseIds)].filter(Boolean);
  if (ids.length === 0) return {};
  const result: Record<string, PreviousSet[]> = {};
  try {
    const rows = unwrap(await supabase.rpc('last_performance', { p_exercise_ids: ids }));
    for (const row of rows) {
      (result[row.exercise_id] ??= []).push({
        weight_kg: row.weight_kg == null ? null : Number(row.weight_kg),
        reps: row.reps,
      });
    }
    await Promise.all(ids.map((id) => writeCache(`previous:${id}`, result[id] ?? [])));
  } catch (error) {
    if (navigator.onLine && !isNetworkError(error)) throw error;
    for (const id of ids) {
      const cached = await readCache<PreviousSet[]>(`previous:${id}`);
      if (cached) result[id] = cached;
    }
  }
  return result;
}

export function usePreviousPerformance(exerciseIds: string[]) {
  const userId = useUserId();
  const ids = [...new Set(exerciseIds)].filter(Boolean).sort();
  return useQuery({
    queryKey: workoutKeys.previous(userId, ids),
    queryFn: () => fetchPreviousPerformance(ids),
    enabled: ids.length > 0,
  });
}

/** Remember a just-finished workout as "previous" immediately, even before it syncs. */
export async function rememberPerformance(
  exercises: {
    exercise_id: string | null;
    sets: {
      weight_kg: number | null;
      reps: number | null;
      duration_seconds: number | null;
      completed_at: string | null;
      is_warmup: boolean;
    }[];
  }[],
) {
  for (const e of exercises) {
    if (!e.exercise_id) continue;
    const sets = e.sets
      .filter((s) => s.completed_at && !s.is_warmup)
      .map((s) => ({ weight_kg: s.weight_kg, reps: s.reps, duration_seconds: s.duration_seconds }));
    if (sets.length > 0) await writeCache(`previous:${e.exercise_id}`, sets);
  }
}

export const toExerciseInfo = (e: Exercise) => ({
  id: e.id,
  name: e.name,
  primary_muscles: e.primary_muscles,
  equipment: e.equipment,
  is_bodyweight: e.is_bodyweight,
});

export function templateToPlan(template: TemplateWithExercises, catalog: Exercise[] = []): PlannedExercise[] {
  const byId = new Map(catalog.map((e) => [e.id, e]));
  return template.items.map((item) => ({
    exercise: toExerciseInfo(item.exercise),
    target_sets: item.target_sets,
    rep_min: item.rep_min,
    rep_max: item.rep_max,
    rest_seconds: item.rest_seconds ?? template.default_rest_seconds,
    notes: item.notes,
    rep_mode: (item.rep_mode as PlannedExercise['rep_mode']) ?? 'reps',
    duration_seconds_min: item.duration_seconds_min,
    group_name: item.group_name,
    tempo: item.tempo,
    alternatives: (item.alternative_exercise_ids ?? [])
      .map((id) => byId.get(id))
      .filter((e): e is Exercise => !!e)
      .map(toExerciseInfo),
  }));
}
