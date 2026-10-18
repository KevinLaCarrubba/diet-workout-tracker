import type { DraftSession, PersonalRecordEvent, RepMode } from '@/offline/types';
import type { Tables } from '@/types/database';
import { elapsedSeconds, sessionStats } from '../session/draft';

/** 52 min, 45s, – */
export const formatMinutes = (seconds: number | null) =>
  seconds == null ? '–' : seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)} min`;

/** One card in the history list, from the server or from this device. */
export interface HistoryItem {
  id: string;
  title: string;
  started_at: string;
  duration_seconds: number | null;
  total_sets: number;
  total_volume_kg: number;
  pr_count: number;
  /** True when the workout only exists on this device so far. */
  pending: boolean;
}

export type ServerSessionRow = Pick<
  Tables<'workout_sessions'>,
  'id' | 'title' | 'started_at' | 'duration_seconds' | 'total_sets' | 'total_volume_kg'
> & { personal_records?: { count: number }[] | null };

export function serverToHistoryItem(row: ServerSessionRow): HistoryItem {
  return {
    id: row.id,
    title: row.title,
    started_at: row.started_at,
    duration_seconds: row.duration_seconds,
    total_sets: row.total_sets,
    total_volume_kg: Number(row.total_volume_kg),
    pr_count: row.personal_records?.[0]?.count ?? 0,
    pending: false,
  };
}

export function draftToHistoryItem(draft: DraftSession): HistoryItem {
  const stats = sessionStats(draft);
  return {
    id: draft.id,
    title: draft.title,
    started_at: draft.started_at,
    duration_seconds: elapsedSeconds(draft),
    total_sets: stats.sets,
    total_volume_kg: stats.volumeKg,
    pr_count: draft.records?.length ?? 0,
    pending: true,
  };
}

/**
 * Server sessions plus finished workouts still waiting to upload. A device
 * draft is shown only while its upload is pending (otherwise the server copy
 * is the truth, possibly on a page not loaded yet). Newest first.
 */
export function mergeHistory(
  server: HistoryItem[],
  drafts: DraftSession[],
  pendingIds: Set<string>,
): HistoryItem[] {
  const byId = new Map(server.map((s) => [s.id, s]));
  for (const d of drafts) {
    if (d.status !== 'completed' || byId.has(d.id) || !pendingIds.has(d.id)) continue;
    byId.set(d.id, draftToHistoryItem(d));
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
}

// ---------------------------------------------------------------------------
// Session detail (one shape for server rows and device drafts)
// ---------------------------------------------------------------------------

export interface DetailSet {
  id: string;
  sort_order: number;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  duration_seconds: number | null;
  is_warmup: boolean;
  completed_at: string | null;
  notes: string | null;
}

export interface DetailExercise {
  id: string;
  exercise_id: string | null;
  substituted_for_exercise_id: string | null;
  sort_order: number;
  exercise_name_snapshot: string;
  rep_mode: RepMode;
  rep_min: number | null;
  rep_max: number | null;
  duration_seconds_min: number | null;
  group_name: string | null;
  tempo: string | null;
  notes: string | null;
  sets: DetailSet[];
}

export interface SessionDetail {
  id: string;
  title: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  total_sets: number;
  total_volume_kg: number;
  notes: string | null;
  exercises: DetailExercise[];
  records: PersonalRecordEvent[];
  source: 'server' | 'device';
}

type ServerSet = Tables<'workout_sets'>;
type ServerExercise = Tables<'workout_session_exercises'> & { sets: ServerSet[] };
export type ServerSessionDetail = Tables<'workout_sessions'> & { exercises: ServerExercise[] };

const num = (v: number | string | null) => (v == null ? null : Number(v));
const toRepMode = (v: string | null | undefined): RepMode => (v === 'amrap' || v === 'timed' ? v : 'reps');
const bySortOrder = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order;

export function serverToDetail(
  row: ServerSessionDetail,
  records: Pick<Tables<'personal_records'>, 'exercise_id' | 'record_type' | 'value' | 'weight_kg' | 'reps'>[],
): SessionDetail {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    started_at: row.started_at,
    ended_at: row.ended_at,
    duration_seconds: row.duration_seconds,
    total_sets: row.total_sets,
    total_volume_kg: Number(row.total_volume_kg),
    notes: row.notes,
    source: 'server',
    records: records.map((r) => ({
      exercise_id: r.exercise_id,
      record_type: r.record_type,
      value: Number(r.value),
      weight_kg: num(r.weight_kg),
      reps: r.reps,
    })),
    exercises: [...row.exercises].sort(bySortOrder).map((e) => ({
      id: e.id,
      exercise_id: e.exercise_id,
      substituted_for_exercise_id: e.substituted_for_exercise_id,
      sort_order: e.sort_order,
      exercise_name_snapshot: e.exercise_name_snapshot,
      rep_mode: toRepMode(e.rep_mode),
      rep_min: e.rep_min,
      rep_max: e.rep_max,
      duration_seconds_min: e.duration_seconds_min,
      group_name: e.group_name,
      tempo: e.tempo,
      notes: e.notes,
      sets: [...e.sets].sort(bySortOrder).map((s) => ({
        id: s.id,
        sort_order: s.sort_order,
        weight_kg: num(s.weight_kg),
        reps: s.reps,
        rpe: num(s.rpe),
        duration_seconds: s.duration_seconds,
        is_warmup: s.is_warmup,
        completed_at: s.completed_at,
        notes: s.notes,
      })),
    })),
  };
}

export function draftToDetail(draft: DraftSession): SessionDetail {
  const stats = sessionStats(draft);
  return {
    id: draft.id,
    title: draft.title,
    status: draft.status,
    started_at: draft.started_at,
    ended_at: draft.ended_at,
    duration_seconds: elapsedSeconds(draft),
    total_sets: stats.sets,
    total_volume_kg: stats.volumeKg,
    notes: draft.notes,
    source: 'device',
    records: draft.records ?? [],
    exercises: [...draft.exercises].sort(bySortOrder).map((e) => ({
      id: e.id,
      exercise_id: e.exercise_id,
      substituted_for_exercise_id: e.substituted_for_exercise_id,
      sort_order: e.sort_order,
      exercise_name_snapshot: e.exercise_name_snapshot,
      rep_mode: e.rep_mode,
      rep_min: e.rep_min,
      rep_max: e.rep_max,
      duration_seconds_min: e.duration_seconds_min,
      group_name: e.group_name,
      tempo: e.tempo,
      notes: e.notes,
      sets: [...e.sets].sort(bySortOrder).map((s) => ({
        id: s.id,
        sort_order: s.sort_order,
        weight_kg: s.weight_kg,
        reps: s.reps,
        rpe: s.rpe,
        duration_seconds: s.duration_seconds,
        is_warmup: s.is_warmup,
        completed_at: s.completed_at,
        notes: s.notes,
      })),
    })),
  };
}

/**
 * The device copy wins while it still has unsynced changes (the server may
 * hold an older snapshot); otherwise the server copy (it has the records).
 */
export function pickDetail(
  server: SessionDetail | null | undefined,
  draft: DraftSession | null | undefined,
  draftPending: boolean,
): SessionDetail | null {
  if (draft && draft.status !== 'discarded' && (draftPending || !server)) return draftToDetail(draft);
  return server ?? null;
}

/** "Superset A", "Tempo 2-1-2-0" badges for an exercise. */
export function exerciseBadges(e: Pick<DetailExercise, 'group_name' | 'tempo'>): string[] {
  const badges: string[] = [];
  if (e.group_name) badges.push(e.group_name);
  if (e.tempo) badges.push(`Tempo ${e.tempo}`);
  return badges;
}
