import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserId } from '@/features/auth/useAuth';
import { supabase, unwrap } from '@/lib/supabase';
import { workoutKeys, type TemplateWithExercises } from '../api';
import type { ItemPayload } from './helpers';

const TEMPLATE_SELECT =
  '*, items:workout_template_exercises(*, exercise:exercises!workout_template_exercises_exercise_id_fkey(*))';

export const templateKeys = {
  detail: (userId: string, templateId: string) => ['workouts', 'template', userId, templateId] as const,
};

/** One template (own, archived or shared) with its ordered items. */
export function useTemplate(templateId: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: templateKeys.detail(userId, templateId),
    queryFn: async (): Promise<TemplateWithExercises | null> => {
      const row = unwrap(
        await supabase.from('workout_templates').select(TEMPLATE_SELECT).eq('id', templateId).maybeSingle(),
      ) as unknown as TemplateWithExercises | null;
      if (!row) return null;
      return { ...row, items: [...row.items].sort((a, b) => a.sort_order - b.sort_order) };
    },
  });
}

function useWorkoutMutation<TArgs, TResult>(fn: (args: TArgs, userId: string) => Promise<TResult>) {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: TArgs) => fn(args, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: workoutKeys.all }),
  });
}

export const useCreateTemplate = () =>
  useWorkoutMutation(async ({ title }: { title: string }, userId) => {
    const id = crypto.randomUUID();
    unwrap(await supabase.from('workout_templates').insert({ id, user_id: userId, title }));
    return id;
  });

export interface TemplatePatch {
  title?: string;
  description?: string | null;
  notes?: string | null;
  default_rest_seconds?: number;
  archived_at?: string | null;
}

export const useUpdateTemplate = () =>
  useWorkoutMutation(async ({ id, patch }: { id: string; patch: TemplatePatch }, userId) =>
    unwrap(await supabase.from('workout_templates').update(patch).eq('id', id).eq('user_id', userId)),
  );

export const useDeleteTemplate = () =>
  useWorkoutMutation(async (id: string, userId) =>
    unwrap(await supabase.from('workout_templates').delete().eq('id', id).eq('user_id', userId)),
  );

/** Copies a shared (or own) template; returns the new template's id. */
export const useCopyTemplate = () =>
  useWorkoutMutation(async (templateId: string) =>
    unwrap(await supabase.rpc('copy_workout_template', { p_template_id: templateId })),
  );

export const useAddTemplateItem = () =>
  useWorkoutMutation(
    async ({
      templateId,
      exerciseId,
      sortOrder,
    }: {
      templateId: string;
      exerciseId: string;
      sortOrder: number;
    }) =>
      unwrap(
        await supabase.from('workout_template_exercises').insert({
          id: crypto.randomUUID(),
          template_id: templateId,
          exercise_id: exerciseId,
          sort_order: sortOrder,
          target_sets: 3,
          rep_min: 8,
          rep_max: 12,
          rep_mode: 'reps',
        }),
      ),
  );

export const useUpdateTemplateItem = () =>
  useWorkoutMutation(
    async ({ id, payload }: { id: string; payload: Partial<ItemPayload> & { exercise_id?: string } }) =>
      unwrap(await supabase.from('workout_template_exercises').update(payload).eq('id', id)),
  );

export const useDeleteTemplateItem = () =>
  useWorkoutMutation(async (id: string) =>
    unwrap(await supabase.from('workout_template_exercises').delete().eq('id', id)),
  );

export const useReorderTemplateItems = () =>
  useWorkoutMutation(async (changes: { id: string; sort_order: number }[]) => {
    for (const c of changes) {
      unwrap(
        await supabase.from('workout_template_exercises').update({ sort_order: c.sort_order }).eq('id', c.id),
      );
    }
  });
