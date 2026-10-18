import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useUserId } from '@/features/auth/useAuth';
import { usePreferences } from '@/features/profile/api';
import { withOfflineCache } from '@/features/workouts/api';
import { supabase, unwrap } from '@/lib/supabase';
import { localDate } from '@/lib/time';
import { db } from '@/offline/db';
import { enqueue } from '@/offline/outbox';
import { useLiveQuery } from '@/offline/useLiveQuery';
import type { TablesInsert } from '@/types/database';
import {
  adHocMealPayload,
  displayOrderFor,
  duplicateSchedule,
  reschedulePayload,
  type MealOccurrence,
  type MealSchedule,
  type OccurrencePatch,
  type SchedulePatch,
} from './logic';
import {
  entriesOnDate,
  localDayBounds,
  mergeWaterEntries,
  pendingWaterOps,
  type DailyTotal,
  type WaterEntry,
} from './water';

/** Meal queries live under ['meals'], water under ['water'] (refreshed after an offline sync). */
export const mealKeys = {
  all: ['meals'] as const,
  days: (userId: string) => ['meals', 'day', userId] as const,
  day: (userId: string, date: string) => ['meals', 'day', userId, date] as const,
  schedules: (userId: string) => ['meals', 'schedules', userId] as const,
};

export const waterKeys = {
  all: ['water'] as const,
  day: (userId: string, date: string) => ['water', 'day', userId, date] as const,
  history: (userId: string, from: string, to: string) => ['water', 'history', userId, from, to] as const,
};

// ---------------------------------------------------------------------------
// Meal day
// ---------------------------------------------------------------------------

export interface MealDay {
  /** Every occurrence on the date, including moved originals. */
  meals: MealOccurrence[];
  /** Replacements on other dates for meals moved away from this date. */
  related: MealOccurrence[];
}

async function fetchMealDay(userId: string, date: string, today: string): Promise<MealDay> {
  return withOfflineCache(`meals-day:${userId}:${date}`, async () => {
    // Only today and later are generated from the plan; past days show what was recorded.
    if (date >= today) unwrap(await supabase.rpc('ensure_my_meal_occurrences', { p_from: date, p_to: date }));
    const meals = unwrap(
      await supabase
        .from('meal_occurrences')
        .select('*')
        .eq('user_id', userId)
        .eq('local_date', date)
        .order('display_order')
        .order('local_time'),
    );
    const movedIds = meals.filter((m) => m.status === 'rescheduled').map((m) => m.id);
    const related = movedIds.length
      ? unwrap(
          await supabase
            .from('meal_occurrences')
            .select('*')
            .eq('user_id', userId)
            .in('rescheduled_from', movedIds)
            .neq('local_date', date),
        )
      : [];
    return { meals, related };
  });
}

export function useMealDay(date: string) {
  const userId = useUserId();
  const { timezone } = usePreferences();
  const today = localDate(timezone);
  return useQuery({
    queryKey: mealKeys.day(userId, date),
    queryFn: () => fetchMealDay(userId, date, today),
  });
}

export function useMealSchedules() {
  const userId = useUserId();
  return useQuery({
    queryKey: mealKeys.schedules(userId),
    queryFn: () =>
      withOfflineCache(`meal-schedules:${userId}`, async () =>
        unwrap(
          await supabase
            .from('meal_schedules')
            .select('*')
            .eq('user_id', userId)
            .order('display_order')
            .order('local_time'),
        ),
      ),
  });
}

/** Patches one occurrence, applying the change on screen right away. */
export function useUpdateOccurrence() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; date: string; patch: OccurrencePatch }) =>
      unwrap(await supabase.from('meal_occurrences').update(patch).eq('id', id).select().single()),
    onMutate: async ({ id, date, patch }) => {
      const key = mealKeys.day(userId, date);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<MealDay>(key);
      if (previous) {
        qc.setQueryData<MealDay>(key, {
          ...previous,
          meals: previous.meals.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        });
      }
      return { previous, key };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) qc.setQueryData(context.key, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: mealKeys.all }),
  });
}

async function dayPlacement(userId: string, date: string, excludeId?: string) {
  const rows = unwrap(
    await supabase
      .from('meal_occurrences')
      .select('id, display_order, local_time, status')
      .eq('user_id', userId)
      .eq('local_date', date),
  );
  return rows.filter((r) => r.id !== excludeId && r.status !== 'rescheduled');
}

export function useRescheduleMeal() {
  const userId = useUserId();
  const { timezone } = usePreferences();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      original,
      date,
      time,
    }: {
      original: MealOccurrence;
      date: string;
      time: string;
    }) => {
      const day = await dayPlacement(userId, date, original.id);
      const { insert, originalPatch } = reschedulePayload(original, {
        id: crypto.randomUUID(),
        userId,
        date,
        time,
        timezone,
        displayOrder: displayOrderFor(day, time),
      });
      // Insert the moved copy first so a failure never loses the meal.
      unwrap(await supabase.from('meal_occurrences').insert(insert));
      unwrap(await supabase.from('meal_occurrences').update(originalPatch).eq('id', original.id));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: mealKeys.all }),
  });
}

export function useAddAdHocMeal() {
  const userId = useUserId();
  const { timezone } = usePreferences();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { label: string; description?: string; date: string; time: string }) => {
      const day = await dayPlacement(userId, input.date);
      const row = adHocMealPayload({
        ...input,
        id: crypto.randomUUID(),
        userId,
        timezone,
        displayOrder: displayOrderFor(day, input.time),
      });
      unwrap(await supabase.from('meal_occurrences').insert(row));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: mealKeys.all }),
  });
}

/** Only meals added by hand (or moved copies) can be deleted; planned ones are skipped instead. */
export function useDeleteOccurrence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('meal_occurrences').delete().eq('id', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: mealKeys.all }),
  });
}

// ---------------------------------------------------------------------------
// Schedules (weekly plan)
// ---------------------------------------------------------------------------

export function useSaveSchedule() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id: string | null; values: Partial<SchedulePatch> }) => {
      if (id) {
        return unwrap(await supabase.from('meal_schedules').update(values).eq('id', id).select().single());
      }
      const row = { ...values, id: crypto.randomUUID(), user_id: userId } as TablesInsert<'meal_schedules'>;
      return unwrap(await supabase.from('meal_schedules').insert(row).select().single());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: mealKeys.all }),
  });
}

export function useDuplicateSchedule() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (schedule: MealSchedule) =>
      unwrap(
        await supabase
          .from('meal_schedules')
          .insert(duplicateSchedule(schedule, crypto.randomUUID(), userId))
          .select()
          .single(),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: mealKeys.all }),
  });
}

export function useDeleteSchedule() {
  const userId = useUserId();
  const { timezone } = usePreferences();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // The FK sets schedule_id to null before the reset trigger runs, so clear
      // upcoming unmarked meals first; marked ones stay as history.
      unwrap(
        await supabase
          .from('meal_occurrences')
          .delete()
          .eq('user_id', userId)
          .eq('schedule_id', id)
          .eq('status', 'pending')
          .gte('local_date', localDate(timezone)),
      );
      unwrap(await supabase.from('meal_schedules').delete().eq('id', id));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: mealKeys.all }),
  });
}

// ---------------------------------------------------------------------------
// Water (offline-first through the outbox)
// ---------------------------------------------------------------------------

async function fetchWaterDay(userId: string, date: string, tz: string): Promise<WaterEntry[]> {
  const { from, to } = localDayBounds(date, tz);
  return withOfflineCache(`water-day:${userId}:${date}`, async () =>
    unwrap(
      await supabase
        .from('water_logs')
        .select('id, user_id, amount_ml, occurred_at')
        .eq('user_id', userId)
        .gte('occurred_at', from)
        .lt('occurred_at', to)
        .order('occurred_at', { ascending: false }),
    ),
  );
}

/** Device outbox entries for water that haven't uploaded yet. */
function usePendingWater(userId: string) {
  const { data } = useLiveQuery(
    () => db.outbox.where('kind').anyOf('water_log', 'delete_water_log').toArray(),
    [],
  );
  return useMemo(() => pendingWaterOps(data ?? [], userId), [data, userId]);
}

/** A day's water entries: server rows merged with unsynced changes from this device. */
export function useWaterDay(date: string) {
  const userId = useUserId();
  const { timezone } = usePreferences();
  const query = useQuery({
    queryKey: waterKeys.day(userId, date),
    queryFn: () => fetchWaterDay(userId, date, timezone),
  });
  const pending = usePendingWater(userId);
  const entries = useMemo(
    () => entriesOnDate(mergeWaterEntries(query.data ?? [], pending), date, timezone),
    [query.data, pending, date, timezone],
  );
  return { ...query, entries };
}

export function useWaterHistory(from: string, to: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: waterKeys.history(userId, from, to),
    queryFn: async (): Promise<DailyTotal[]> =>
      withOfflineCache(`water-history:${userId}:${from}:${to}`, async () =>
        unwrap(await supabase.rpc('water_daily_totals', { p_from: from, p_to: to })).map((r) => ({
          local_date: r.local_date,
          total_ml: r.total_ml,
        })),
      ),
  });
}

/**
 * Water writes go through the outbox so they work offline; the day cache is
 * updated too so nothing flickers between upload and refetch.
 */
export function useWaterActions() {
  const userId = useUserId();
  const { timezone } = usePreferences();
  const qc = useQueryClient();

  const patchDay = (occurredAt: string, fn: (rows: WaterEntry[]) => WaterEntry[]) => {
    const key = waterKeys.day(userId, localDate(timezone, occurredAt));
    qc.setQueryData<WaterEntry[]>(key, (rows) => (rows ? fn(rows) : rows));
  };

  return useMemo(
    () => ({
      /** Logs water now (or at `occurredAt`); returns the new entry for undo. */
      async add(amountMl: number, occurredAt: string = new Date().toISOString()): Promise<WaterEntry> {
        const entry = {
          id: crypto.randomUUID(),
          user_id: userId,
          amount_ml: Math.round(amountMl),
          occurred_at: occurredAt,
        };
        await enqueue('water_log', entry.id, userId, entry);
        patchDay(occurredAt, (rows) => [entry, ...rows.filter((r) => r.id !== entry.id)]);
        return entry;
      },
      async update(entry: WaterEntry, amountMl: number) {
        const next = {
          id: entry.id,
          user_id: userId,
          amount_ml: Math.round(amountMl),
          occurred_at: entry.occurred_at,
        };
        await enqueue('water_log', entry.id, userId, next);
        patchDay(entry.occurred_at, (rows) => rows.map((r) => (r.id === entry.id ? next : r)));
      },
      async remove(entry: Pick<WaterEntry, 'id' | 'occurred_at'>) {
        // A queued (not yet uploaded) add is simply dropped; the delete covers anything already sent.
        await db.outbox.delete(`water_log:${entry.id}`);
        await enqueue('delete_water_log', entry.id, userId, { id: entry.id });
        patchDay(entry.occurred_at, (rows) => rows.filter((r) => r.id !== entry.id));
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, timezone, qc],
  );
}
