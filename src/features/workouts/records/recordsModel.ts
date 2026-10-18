import type { Tables } from '@/types/database';
import { estimateOneRepMax } from '../session/draft';
import type { RecordType } from './recordFormat';

/** Epley estimate; 1–12 reps only (same formula as the server's estimate_1rm). */
export { estimateOneRepMax };

export type PersonalRecordRow = Pick<
  Tables<'personal_records'>,
  'id' | 'exercise_id' | 'record_type' | 'value' | 'weight_kg' | 'reps' | 'achieved_at' | 'source_session_id'
> & { exercise?: { name: string } | null };

export interface BestRecord {
  value: number;
  weight_kg: number | null;
  reps: number | null;
  achieved_at: string;
  source_session_id: string;
}

export interface ExerciseRecords {
  exercise_id: string;
  name: string;
  best: Partial<Record<RecordType, BestRecord>>;
  /** Most reps at each weight, heaviest weight first. */
  repsAtWeight: BestRecord[];
  last_achieved_at: string;
}

const toBest = (r: PersonalRecordRow): BestRecord => ({
  value: Number(r.value),
  weight_kg: r.weight_kg == null ? null : Number(r.weight_kg),
  reps: r.reps,
  achieved_at: r.achieved_at,
  source_session_id: r.source_session_id,
});

/** Higher value wins; ties go to the later achievement. */
const better = (a: BestRecord, b: BestRecord) =>
  b.value > a.value || (b.value === a.value && Date.parse(b.achieved_at) > Date.parse(a.achieved_at)) ? b : a;

/**
 * Collapses the record log into the current best of each kind per exercise.
 * "Most reps at a weight" keeps the best per weight, and its headline is the
 * one with the most reps (heavier weight on ties).
 */
export function bestRecordsByExercise(
  rows: PersonalRecordRow[],
  names: Map<string, string> = new Map(),
): ExerciseRecords[] {
  const map = new Map<string, ExerciseRecords & { perWeight: Map<number, BestRecord> }>();
  for (const row of rows) {
    let entry = map.get(row.exercise_id);
    if (!entry) {
      entry = {
        exercise_id: row.exercise_id,
        name: row.exercise?.name ?? names.get(row.exercise_id) ?? 'Exercise',
        best: {},
        repsAtWeight: [],
        last_achieved_at: row.achieved_at,
        perWeight: new Map(),
      };
      map.set(row.exercise_id, entry);
    }
    if (Date.parse(row.achieved_at) > Date.parse(entry.last_achieved_at))
      entry.last_achieved_at = row.achieved_at;
    const rec = toBest(row);
    if (row.record_type === 'max_reps_at_weight') {
      const w = rec.weight_kg ?? 0;
      const prev = entry.perWeight.get(w);
      entry.perWeight.set(w, prev ? better(prev, rec) : rec);
    } else {
      const prev = entry.best[row.record_type];
      entry.best[row.record_type] = prev ? better(prev, rec) : rec;
    }
  }
  return [...map.values()]
    .map(({ perWeight, ...e }) => {
      const repsAtWeight = [...perWeight.values()].sort((a, b) => (b.weight_kg ?? 0) - (a.weight_kg ?? 0));
      const top = [...repsAtWeight].sort(
        (a, b) => b.value - a.value || (b.weight_kg ?? 0) - (a.weight_kg ?? 0),
      )[0];
      return { ...e, repsAtWeight, best: top ? { ...e.best, max_reps_at_weight: top } : e.best };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function filterByName<T extends { name: string }>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  return q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
}

// ---------------------------------------------------------------------------
// Strength progression (estimated 1RM per session)
// ---------------------------------------------------------------------------

export interface ProgressionSetRow {
  weight_kg: number | string | null;
  reps: number | null;
  is_warmup: boolean;
  completed_at: string | null;
}

export interface ProgressionRow {
  session: { id: string; started_at: string; status: string } | null;
  sets: ProgressionSetRow[];
}

export interface ProgressionPoint {
  session_id: string;
  started_at: string;
  /** ms epoch, for a time x-axis. */
  t: number;
  e1rm_kg: number;
  /** The set that produced the estimate. */
  weight_kg: number;
  reps: number;
}

/**
 * Best estimated 1RM per completed session from completed working sets,
 * oldest first. Sessions without an estimable set (e.g. >12 reps) are skipped.
 */
export function progressionFromRows(rows: ProgressionRow[]): ProgressionPoint[] {
  const bySession = new Map<string, ProgressionPoint>();
  for (const row of rows) {
    const s = row.session;
    if (!s || s.status !== 'completed') continue;
    for (const set of row.sets) {
      if (!set.completed_at || set.is_warmup) continue;
      const weight = set.weight_kg == null ? null : Number(set.weight_kg);
      const e1rm = estimateOneRepMax(weight, set.reps);
      if (e1rm == null) continue;
      const prev = bySession.get(s.id);
      if (!prev || e1rm > prev.e1rm_kg) {
        bySession.set(s.id, {
          session_id: s.id,
          started_at: s.started_at,
          t: Date.parse(s.started_at),
          e1rm_kg: e1rm,
          weight_kg: weight!,
          reps: set.reps!,
        });
      }
    }
  }
  return [...bySession.values()].sort((a, b) => a.t - b.t);
}
