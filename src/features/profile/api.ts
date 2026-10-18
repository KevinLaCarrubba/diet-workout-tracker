import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserId } from '@/features/auth/useAuth';
import { supabase, unwrap } from '@/lib/supabase';
import { withOfflineCache } from '@/offline/withOfflineCache';
import { browserTimezone, localDate } from '@/lib/time';
import type { UnitSystem } from '@/lib/units';
import type { Tables, TablesUpdate } from '@/types/database';

export type Profile = Tables<'profiles'>;
export type UserSettings = Tables<'user_settings'>;
export type FitnessGoal = Tables<'fitness_goals'>;

export const profileKeys = {
  profile: (userId: string) => ['profile', userId] as const,
  settings: (userId: string) => ['settings', userId] as const,
  goal: (userId: string) => ['goal', userId] as const,
};

export function useProfile() {
  const userId = useUserId();
  return useQuery({
    queryKey: profileKeys.profile(userId),
    queryFn: () =>
      withOfflineCache(`profile:${userId}`, async () =>
        unwrap(await supabase.from('profiles').select('*').eq('id', userId).single()),
      ),
  });
}

/** Units and timezone with safe defaults while the profile loads. */
export function usePreferences(): { units: UnitSystem; timezone: string; profile: Profile | undefined } {
  const { data } = useProfile();
  return {
    units: data?.preferred_units ?? 'imperial',
    timezone: data?.timezone ?? browserTimezone(),
    profile: data,
  };
}

type ProfilePatch = Pick<
  TablesUpdate<'profiles'>,
  'display_name' | 'height_cm' | 'timezone' | 'preferred_units' | 'onboarded_at'
>;

export function useUpdateProfile() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: ProfilePatch) =>
      unwrap(await supabase.from('profiles').update(patch).eq('id', userId).select().single()),
    onSuccess: (profile) => qc.setQueryData(profileKeys.profile(userId), profile),
  });
}

export function useSettings() {
  const userId = useUserId();
  return useQuery({
    queryKey: profileKeys.settings(userId),
    queryFn: () =>
      withOfflineCache(`settings:${userId}`, async () =>
        unwrap(await supabase.from('user_settings').select('*').eq('user_id', userId).single()),
      ),
  });
}

export type SettingsPatch = Omit<TablesUpdate<'user_settings'>, 'user_id' | 'created_at' | 'updated_at'>;

export function useUpdateSettings() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: SettingsPatch) =>
      unwrap(await supabase.from('user_settings').update(patch).eq('user_id', userId).select().single()),
    onSuccess: (settings) => qc.setQueryData(profileKeys.settings(userId), settings),
  });
}

/** The goal in effect today (latest effective_from). */
export function useCurrentGoal() {
  const userId = useUserId();
  return useQuery({
    queryKey: profileKeys.goal(userId),
    queryFn: () =>
      withOfflineCache(`goal:${userId}`, async () =>
        unwrap(
          await supabase
            .from('fitness_goals')
            .select('*')
            .eq('user_id', userId)
            .order('effective_from', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ),
      ),
  });
}

export interface GoalInput {
  start_weight_kg: number;
  target_weight_kg: number;
  target_date: string | null;
}

/**
 * Goals are kept as history: changing the goal on a new day adds a row, while
 * edits on the same day update today's row.
 */
export function useSaveGoal() {
  const userId = useUserId();
  const { timezone } = usePreferences();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (goal: GoalInput) => {
      const today = localDate(timezone);
      const existing = unwrap(
        await supabase
          .from('fitness_goals')
          .select('id')
          .eq('user_id', userId)
          .eq('effective_from', today)
          .maybeSingle(),
      );
      if (existing) {
        return unwrap(
          await supabase.from('fitness_goals').update(goal).eq('id', existing.id).select().single(),
        );
      }
      return unwrap(
        await supabase
          .from('fitness_goals')
          .insert({ ...goal, user_id: userId, effective_from: today })
          .select()
          .single(),
      );
    },
    onSuccess: (goal) => qc.setQueryData(profileKeys.goal(userId), goal),
  });
}
