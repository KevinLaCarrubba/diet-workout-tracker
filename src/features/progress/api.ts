import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserId } from '@/features/auth/useAuth';
import { usePreferences } from '@/features/profile/api';
import { supabase, unwrap } from '@/lib/supabase';
import { dayjs, zonedToUtc } from '@/lib/time';
import type { Tables, TablesInsert } from '@/types/database';
import { addDays } from './calendar';
import { resizeImage } from './image';

export type WeightLog = Pick<Tables<'weight_logs'>, 'id' | 'weight_kg' | 'measured_at' | 'notes'>;
export type BodyMeasurement = Tables<'body_measurements'>;
export type ProgressPhoto = Tables<'progress_photos'>;
export type PhotoPose = 'front' | 'side' | 'back' | 'other';

export const PHOTO_BUCKET = 'progress-photos';
/** Signed photo URLs live for five minutes; refresh a little before that. */
const SIGNED_URL_SECONDS = 300;

/** Every progress query lives under ['progress'] so a mutation can refresh them together. */
export const progressKeys = {
  all: ['progress'] as const,
  weights: (userId: string) => ['progress', 'weights', userId] as const,
  trend: (userId: string, from: string, to: string) => ['progress', 'trend', userId, from, to] as const,
  weekly: (userId: string, weekStart: string) => ['progress', 'weekly', userId, weekStart] as const,
  measurements: (userId: string) => ['progress', 'measurements', userId] as const,
  photos: (userId: string) => ['progress', 'photos', userId] as const,
  photoUrls: (userId: string, paths: string[]) => ['progress', 'photo-urls', userId, ...paths] as const,
  adherence: (userId: string, month: string) => ['progress', 'adherence', userId, month] as const,
  cardioWeeks: (userId: string, from: string, to: string) =>
    ['progress', 'cardio-weeks', userId, from, to] as const,
  waterDays: (userId: string, from: string, to: string) =>
    ['progress', 'water-days', userId, from, to] as const,
};

/** UTC bounds [start, end) covering local dates from..to in `tz`. */
const utcBounds = (from: string, to: string, tz: string) => ({
  start: zonedToUtc(from, '00:00', tz),
  end: zonedToUtc(addDays(to, 1), '00:00', tz),
});

// ---------------------------------------------------------------------------
// Weight
// ---------------------------------------------------------------------------

/** Recent weigh-ins, newest first (plenty for a year of daily logging). */
export function useWeightLogs() {
  const userId = useUserId();
  return useQuery({
    queryKey: progressKeys.weights(userId),
    queryFn: async () =>
      unwrap(
        await supabase
          .from('weight_logs')
          .select('id, weight_kg, measured_at, notes')
          .eq('user_id', userId)
          .order('measured_at', { ascending: false })
          .limit(1000),
      ).map((w) => ({ ...w, weight_kg: Number(w.weight_kg) })),
  });
}

export interface TrendRow {
  local_date: string;
  weight_kg: number;
  avg_7d: number;
  entries_7d: number;
}

/** Server-side daily weights + trailing 7-day average (rpc weight_trend). */
export function useWeightTrend(from: string, to: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: progressKeys.trend(userId, from, to),
    queryFn: async (): Promise<TrendRow[]> =>
      unwrap(await supabase.rpc('weight_trend', { p_from: from, p_to: to })).map((r) => ({
        local_date: r.local_date,
        weight_kg: Number(r.weight_kg),
        avg_7d: Number(r.avg_7d),
        entries_7d: r.entries_7d,
      })),
  });
}

export interface WeightInput {
  weight_kg: number;
  measured_at: string;
  notes: string | null;
}

export function useSaveWeight() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: WeightInput & { id?: string }) => {
      if (!navigator.onLine)
        throw new Error("You're offline. Weigh-ins need a connection; try again once you're back online.");
      if (id) {
        unwrap(await supabase.from('weight_logs').update(input).eq('id', id));
        return;
      }
      unwrap(
        await supabase.from('weight_logs').insert({
          id: crypto.randomUUID(),
          user_id: userId,
          ...input,
        } satisfies TablesInsert<'weight_logs'>),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: progressKeys.all }),
  });
}

export function useDeleteWeight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('weight_logs').delete().eq('id', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: progressKeys.all }),
  });
}

// ---------------------------------------------------------------------------
// Weekly summary
// ---------------------------------------------------------------------------

export interface WeeklySummary {
  week_start: string;
  workouts_completed: number;
  workouts_scheduled: number;
  workouts_skipped: number;
  rest_days: number;
  total_volume_kg: number;
  cardio_minutes: number;
  meals_eaten: number;
  meals_planned: number;
  water_days_on_target: number;
  weigh_ins: number;
  weight_start_kg: number | null;
  weight_end_kg: number | null;
}

export function useWeeklySummary(weekStart: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: progressKeys.weekly(userId, weekStart),
    queryFn: async () =>
      unwrap(
        await supabase.rpc('weekly_summary', { p_week_start: weekStart }),
      ) as unknown as WeeklySummary | null,
  });
}

// ---------------------------------------------------------------------------
// Body measurements
// ---------------------------------------------------------------------------

export const MEASUREMENT_FIELDS = [
  'waist_cm',
  'chest_cm',
  'hips_cm',
  'arm_cm',
  'thigh_cm',
  'body_fat_percent',
] as const;
export type MeasurementField = (typeof MEASUREMENT_FIELDS)[number];
export type MeasurementInput = { measured_at: string; notes: string | null } & Record<
  MeasurementField,
  number | null
>;

export function useMeasurements() {
  const userId = useUserId();
  return useQuery({
    queryKey: progressKeys.measurements(userId),
    queryFn: async () =>
      unwrap(
        await supabase
          .from('body_measurements')
          .select('*')
          .eq('user_id', userId)
          .order('measured_at', { ascending: false })
          .limit(500),
      ),
  });
}

export function useSaveMeasurement() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: MeasurementInput & { id?: string }) => {
      if (id) {
        unwrap(await supabase.from('body_measurements').update(input).eq('id', id));
        return;
      }
      unwrap(
        await supabase
          .from('body_measurements')
          .insert({ id: crypto.randomUUID(), user_id: userId, ...input }),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: progressKeys.measurements(userId) }),
  });
}

export function useDeleteMeasurement() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('body_measurements').delete().eq('id', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: progressKeys.measurements(userId) }),
  });
}

// ---------------------------------------------------------------------------
// Progress photos (private bucket, signed URLs only)
// ---------------------------------------------------------------------------

export function usePhotos() {
  const userId = useUserId();
  return useQuery({
    queryKey: progressKeys.photos(userId),
    queryFn: async () =>
      unwrap(
        await supabase
          .from('progress_photos')
          .select('*')
          .eq('user_id', userId)
          .order('captured_at', { ascending: false })
          .limit(500),
      ),
  });
}

/** Short-lived signed URLs for private photos, keyed by storage path. */
export function useSignedPhotoUrls(paths: string[]) {
  const userId = useUserId();
  return useQuery({
    queryKey: progressKeys.photoUrls(userId, paths),
    enabled: paths.length > 0,
    staleTime: (SIGNED_URL_SECONDS - 60) * 1000,
    refetchInterval: (SIGNED_URL_SECONDS - 60) * 1000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const rows = unwrap(
        await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS),
      );
      const map: Record<string, string> = {};
      for (const row of rows) if (row.path && row.signedUrl && !row.error) map[row.path] = row.signedUrl;
      return map;
    },
  });
}

export interface PhotoUploadInput {
  file: Blob;
  pose: PhotoPose | null;
  captured_at: string;
  notes: string | null;
}

export function useUploadPhoto() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, ...meta }: PhotoUploadInput) => {
      if (!navigator.onLine) throw new Error("You're offline. Photos upload once you're back online.");
      const jpeg = await resizeImage(file);
      const path = `${userId}/${crypto.randomUUID()}.jpg`;
      unwrap(
        await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(path, jpeg, { contentType: 'image/jpeg', upsert: false }),
      );
      const inserted = await supabase
        .from('progress_photos')
        .insert({ id: crypto.randomUUID(), user_id: userId, private_storage_path: path, ...meta });
      if (inserted.error) {
        // Don't leave an orphaned file behind.
        await supabase.storage.from(PHOTO_BUCKET).remove([path]);
        unwrap(inserted);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: progressKeys.photos(userId) }),
  });
}

export function useUpdatePhoto() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: {
      id: string;
      pose: PhotoPose | null;
      captured_at: string;
      notes: string | null;
    }) => unwrap(await supabase.from('progress_photos').update(patch).eq('id', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: progressKeys.photos(userId) }),
  });
}

export function useDeletePhoto() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (photo: ProgressPhoto) => {
      unwrap(await supabase.storage.from(PHOTO_BUCKET).remove([photo.private_storage_path]));
      unwrap(await supabase.from('progress_photos').delete().eq('id', photo.id));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: progressKeys.photos(userId) }),
  });
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export interface AdherenceMonth {
  scheduled: Pick<Tables<'scheduled_workouts'>, 'id' | 'local_date' | 'status' | 'is_rest'>[];
  /** Completed sessions per local date. */
  completedByDate: Record<string, number>;
}

/** Schedule occurrences (generated first) and completed sessions for a calendar month (YYYY-MM). */
export function useAdherenceMonth(month: string) {
  const userId = useUserId();
  const { timezone } = usePreferences();
  return useQuery({
    queryKey: progressKeys.adherence(userId, month),
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<AdherenceMonth> => {
      const from = `${month}-01`;
      const to = dayjs.utc(from).endOf('month').format('YYYY-MM-DD');
      unwrap(await supabase.rpc('ensure_my_scheduled_workouts', { p_from: from, p_to: to }));
      const { start, end } = utcBounds(from, to, timezone);
      const [scheduled, sessions] = await Promise.all([
        supabase
          .from('scheduled_workouts')
          .select('id, local_date, status, is_rest')
          .eq('user_id', userId)
          .gte('local_date', from)
          .lte('local_date', to),
        supabase
          .from('workout_sessions')
          .select('id, started_at')
          .eq('user_id', userId)
          .eq('status', 'completed')
          .gte('started_at', start)
          .lt('started_at', end),
      ]);
      const completedByDate: Record<string, number> = {};
      for (const s of unwrap(sessions)) {
        const d = dayjs(s.started_at).tz(timezone).format('YYYY-MM-DD');
        completedByDate[d] = (completedByDate[d] ?? 0) + 1;
      }
      return { scheduled: unwrap(scheduled), completedByDate };
    },
  });
}

/** Cardio sessions (local date + seconds) between two local dates. */
export function useCardioBetween(from: string, to: string) {
  const userId = useUserId();
  const { timezone } = usePreferences();
  return useQuery({
    queryKey: progressKeys.cardioWeeks(userId, from, to),
    queryFn: async () => {
      const { start, end } = utcBounds(from, to, timezone);
      const rows = unwrap(
        await supabase
          .from('cardio_sessions')
          .select('occurred_at, duration_seconds')
          .eq('user_id', userId)
          .gte('occurred_at', start)
          .lt('occurred_at', end),
      );
      return rows.map((r) => ({
        date: dayjs(r.occurred_at).tz(timezone).format('YYYY-MM-DD'),
        seconds: r.duration_seconds,
      }));
    },
  });
}

/** Daily water totals between two local dates (rpc water_daily_totals). */
export function useWaterDays(from: string, to: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: progressKeys.waterDays(userId, from, to),
    queryFn: async () => unwrap(await supabase.rpc('water_daily_totals', { p_from: from, p_to: to })),
  });
}
