import { useQuery } from '@tanstack/react-query';
import { useUserId } from '@/features/auth/useAuth';
import { usePreferences } from '@/features/profile/api';
import { supabase, unwrap } from '@/lib/supabase';
import { dayjs, localDate, zonedToUtc } from '@/lib/time';
import { withOfflineCache } from '@/offline/withOfflineCache';

/** Today's weigh-in status and recent workouts for the dashboard. */
export function useHomeActivity() {
  const userId = useUserId();
  const { timezone } = usePreferences();
  const today = localDate(timezone);
  return useQuery({
    queryKey: ['workouts', 'home', userId, today],
    queryFn: () =>
      withOfflineCache(`home:${userId}:${today}`, async () => {
        const start = zonedToUtc(today, '00:00', timezone);
        const end = dayjs(start).add(1, 'day').toISOString();
        const [weights, sessions] = await Promise.all([
          supabase
            .from('weight_logs')
            .select('id')
            .eq('user_id', userId)
            .gte('measured_at', start)
            .lt('measured_at', end),
          supabase
            .from('workout_sessions')
            .select('id, title, started_at, duration_seconds, total_sets')
            .eq('user_id', userId)
            .eq('status', 'completed')
            .order('started_at', { ascending: false })
            .limit(3),
        ]);
        const recent = unwrap(sessions);
        return {
          weighedIn: unwrap(weights).length > 0,
          recent,
          workoutDoneToday: recent.some((s) => localDate(timezone, s.started_at) === today),
        };
      }),
  });
}
