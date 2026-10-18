import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserId } from '@/features/auth/useAuth';
import { usePreferences } from '@/features/profile/api';
import { supabase, unwrap } from '@/lib/supabase';
import { localDate } from '@/lib/time';
import type { Tables } from '@/types/database';
import { withOfflineCache, workoutKeys } from '../api';
import { buildReschedule, type Rule, type RuleChange } from './week';

export type ScheduledWorkout = Tables<'scheduled_workouts'> & {
  template: Pick<Tables<'workout_templates'>, 'id' | 'title'> | null;
};

export const scheduleKeys = {
  range: (userId: string, from: string, to: string) => ['workouts', 'scheduled', userId, from, to] as const,
  rules: (userId: string) => ['workouts', 'schedule-rules', userId] as const,
  links: (userId: string, ids: string[]) => ['workouts', 'scheduled-links', userId, ...ids] as const,
};

/** Dated occurrences in [from, to], generating them from the weekly plan first. */
export async function fetchScheduledWorkouts(
  userId: string,
  from: string,
  to: string,
): Promise<ScheduledWorkout[]> {
  return withOfflineCache(`scheduled:${userId}:${from}:${to}`, async () => {
    unwrap(await supabase.rpc('ensure_my_scheduled_workouts', { p_from: from, p_to: to }));
    const rows = unwrap(
      await supabase
        .from('scheduled_workouts')
        .select('*, template:workout_templates(id, title)')
        .eq('user_id', userId)
        .gte('local_date', from)
        .lte('local_date', to)
        .order('local_date')
        .order('local_time', { nullsFirst: true }),
    );
    return rows as unknown as ScheduledWorkout[];
  });
}

export function useScheduledWorkouts(from: string, to: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: scheduleKeys.range(userId, from, to),
    queryFn: () => fetchScheduledWorkouts(userId, from, to),
  });
}

/** Today's plan in the user's timezone: the workout (or rest day) to show on Home and Workouts. */
export function useTodaySchedule() {
  const { timezone } = usePreferences();
  const today = localDate(timezone);
  const query = useScheduledWorkouts(today, today);
  const items = (query.data ?? []).filter((s) => s.status !== 'rescheduled');
  return {
    ...query,
    today,
    workout: items.find((s) => !s.is_rest) ?? null,
    isRestDay: items.length > 0 && items.every((s) => s.is_rest),
  };
}

// ---------------------------------------------------------------------------
// Schedule page: weekly rules, skip / reschedule
// ---------------------------------------------------------------------------

/** Active weekly rules (one per weekday at most). */
export function useScheduleRules() {
  const userId = useUserId();
  return useQuery({
    queryKey: scheduleKeys.rules(userId),
    queryFn: async (): Promise<Rule[]> =>
      unwrap(
        await supabase
          .from('workout_schedules')
          .select('id, weekday, template_id, local_time, active')
          .eq('user_id', userId)
          .eq('active', true)
          .order('weekday'),
      ),
  });
}

/** Applies a weekday change; the DB trigger regenerates that rule's future occurrences. */
export function useSaveScheduleRule() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (change: RuleChange) => {
      if (change.type === 'insert') {
        unwrap(
          await supabase
            .from('workout_schedules')
            .insert({ user_id: userId, active: true, ...change.values }),
        );
      } else if (change.type === 'update') {
        unwrap(
          await supabase
            .from('workout_schedules')
            .update(change.patch)
            .eq('id', change.id)
            .eq('user_id', userId),
        );
      } else if (change.type === 'deactivate') {
        unwrap(
          await supabase
            .from('workout_schedules')
            .update({ active: false })
            .eq('id', change.id)
            .eq('user_id', userId),
        );
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workoutKeys.all }),
  });
}

export function useSetScheduledStatus() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'scheduled' | 'skipped' }) =>
      unwrap(await supabase.from('scheduled_workouts').update({ status }).eq('id', id).eq('user_id', userId)),
    onSuccess: () => qc.invalidateQueries({ queryKey: workoutKeys.all }),
  });
}

export function useRescheduleWorkout() {
  const { timezone } = usePreferences();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      original,
      date,
      time,
    }: {
      original: ScheduledWorkout;
      date: string;
      time: string | null;
    }) => {
      const { insert, update } = buildReschedule(original, { date, time }, timezone);
      unwrap(await supabase.from('scheduled_workouts').insert(insert));
      unwrap(await supabase.from('scheduled_workouts').update(update).eq('id', original.id));
      return insert;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: workoutKeys.all }),
  });
}

export interface ScheduleLink {
  id: string;
  local_date: string;
  local_time: string | null;
  rescheduled_from: string | null;
}

/**
 * Where moved workouts went ("moved to Thu") and where one-offs came from
 * ("moved from Tue"); either end may fall outside the visible week.
 */
export function useRescheduleLinks(rows: ScheduledWorkout[] | undefined) {
  const userId = useUserId();
  const movedIds = (rows ?? []).filter((r) => r.status === 'rescheduled').map((r) => r.id);
  const fromIds = (rows ?? []).map((r) => r.rescheduled_from).filter((id): id is string => !!id);
  const ids = [...new Set([...movedIds, ...fromIds])].sort();
  return useQuery({
    queryKey: scheduleKeys.links(userId, ids),
    enabled: ids.length > 0,
    queryFn: async () => {
      const list = ids.join(',');
      const found = unwrap(
        await supabase
          .from('scheduled_workouts')
          .select('id, local_date, local_time, rescheduled_from')
          .eq('user_id', userId)
          .or(`rescheduled_from.in.(${list}),id.in.(${list})`),
      ) as ScheduleLink[];
      const movedTo = new Map<string, ScheduleLink>();
      const byId = new Map<string, ScheduleLink>();
      for (const r of found) {
        byId.set(r.id, r);
        if (r.rescheduled_from) movedTo.set(r.rescheduled_from, r);
      }
      return { movedTo, byId };
    },
  });
}
