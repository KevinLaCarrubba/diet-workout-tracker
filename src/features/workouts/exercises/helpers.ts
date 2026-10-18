import { formatWeight, type UnitSystem } from '@/lib/units';
import type { Exercise } from '../api';

/** Distinct primary muscle groups in the catalog, alphabetical. */
export function muscleGroups(exercises: Pick<Exercise, 'primary_muscles'>[]): string[] {
  const set = new Set<string>();
  for (const e of exercises) for (const m of e.primary_muscles) if (m.trim()) set.add(m.trim().toLowerCase());
  return [...set].sort();
}

export const byMuscle = <T extends Pick<Exercise, 'primary_muscles'>>(
  exercises: T[],
  muscle: string | null,
) =>
  muscle ? exercises.filter((e) => e.primary_muscles.some((m) => m.toLowerCase() === muscle)) : exercises;

/** Turns database errors into something a person can act on. */
export function exerciseErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === '23503') {
    return 'This exercise is used in one of your templates. Remove it from those templates first, then delete it.';
  }
  if (code === '23505') return 'You already have an exercise with that name.';
  return error instanceof Error ? error.message : String(error);
}

export interface HistorySet {
  id: string;
  sort_order: number;
  weight_kg: number | null;
  reps: number | null;
  duration_seconds: number | null;
  is_warmup: boolean;
  completed_at: string | null;
}

export interface HistoryRow {
  id: string;
  rep_mode: string;
  session: { id: string; started_at: string; title: string; status: string } | null;
  sets: HistorySet[];
}

export interface HistorySession {
  sessionId: string;
  title: string;
  startedAt: string;
  sets: HistorySet[];
}

/** Last `limit` completed sessions with their completed sets, newest first. */
export function summarizeHistory(rows: HistoryRow[], limit = 5): HistorySession[] {
  const bySession = new Map<string, HistorySession>();
  for (const row of rows) {
    if (!row.session || row.session.status !== 'completed') continue;
    const done = row.sets.filter((s) => s.completed_at);
    if (done.length === 0) continue;
    const entry = bySession.get(row.session.id) ?? {
      sessionId: row.session.id,
      title: row.session.title,
      startedAt: row.session.started_at,
      sets: [],
    };
    entry.sets.push(...done);
    bySession.set(row.session.id, entry);
  }
  return [...bySession.values()]
    .map((s) => ({ ...s, sets: [...s.sets].sort((a, b) => a.sort_order - b.sort_order) }))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit);
}

/** "135 lb × 8", "45s", "Bodyweight × 12" */
export function formatHistorySet(set: HistorySet, units: UnitSystem): string {
  if (set.duration_seconds != null && set.reps == null) return `${set.duration_seconds}s`;
  const weight =
    set.weight_kg != null && Number(set.weight_kg) > 0 ? formatWeight(Number(set.weight_kg), units) : null;
  const reps = set.reps != null ? `${set.reps}` : null;
  const parts = [weight ?? (reps ? 'BW' : null), reps].filter(Boolean).join(' × ');
  const time = set.duration_seconds != null ? `${set.duration_seconds}s` : null;
  return [parts, time].filter(Boolean).join(' · ') || '—';
}
