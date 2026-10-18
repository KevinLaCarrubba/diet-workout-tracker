import type { DraftExercise, DraftSession, DraftSet, PreviousSet, RepMode, RestTimer } from '@/offline/types';

/**
 * Pure operations on an in-progress workout. Every function returns a new
 * draft; persistence and sync happen in sessionStore.ts.
 */

export interface ExerciseInfo {
  id: string;
  name: string;
  primary_muscles: string[];
  equipment: string | null;
  is_bodyweight: boolean;
}

export interface PlannedExercise {
  exercise: ExerciseInfo;
  target_sets: number;
  rep_min: number | null;
  rep_max: number | null;
  rest_seconds: number | null;
  notes?: string | null;
  rep_mode?: RepMode;
  duration_seconds_min?: number | null;
  group_name?: string | null;
  tempo?: string | null;
  alternatives?: ExerciseInfo[];
}

export type PreviousByExercise = Record<string, PreviousSet[]>;

const uuid = () => crypto.randomUUID();
const iso = (ms: number) => new Date(ms).toISOString();

/** Previous performance for set `index`: same set last time, else the last set done. */
export function previousFor(previous: PreviousSet[] | undefined, index: number): PreviousSet | null {
  if (!previous || previous.length === 0) return null;
  return previous[index] ?? previous[previous.length - 1] ?? null;
}

function blankSet(index: number, prev: PreviousSet | null): DraftSet {
  return {
    id: uuid(),
    sort_order: index,
    weight_kg: prev?.weight_kg ?? null,
    reps: prev?.reps ?? null,
    rpe: null,
    duration_seconds: prev?.duration_seconds ?? null,
    is_warmup: false,
    completed_at: null,
    notes: null,
    prefilled: prev != null,
  };
}

export function buildExercise(
  plan: PlannedExercise,
  previous: PreviousSet[] | undefined,
  sortOrder: number,
): DraftExercise {
  const count = Math.max(1, plan.target_sets);
  const repMode = plan.rep_mode ?? 'reps';
  return {
    id: uuid(),
    exercise_id: plan.exercise.id,
    substituted_for_exercise_id: null,
    sort_order: sortOrder,
    exercise_name_snapshot: plan.exercise.name,
    primary_muscles_snapshot: plan.exercise.primary_muscles,
    equipment: plan.exercise.equipment,
    is_bodyweight: plan.exercise.is_bodyweight,
    rest_seconds: plan.rest_seconds,
    rep_min: repMode === 'reps' ? plan.rep_min : null,
    rep_max: repMode === 'reps' ? plan.rep_max : null,
    rep_mode: repMode,
    duration_seconds_min: plan.duration_seconds_min ?? null,
    group_name: plan.group_name ?? null,
    tempo: plan.tempo ?? null,
    alternatives: plan.alternatives ?? [],
    notes: plan.notes ?? null,
    sets: Array.from({ length: count }, (_, i) => blankSet(i, previousFor(previous, i))),
  };
}

export function createDraft(opts: {
  userId: string;
  title: string;
  templateId?: string | null;
  scheduledWorkoutId?: string | null;
  plan: PlannedExercise[];
  previous: PreviousByExercise;
  now?: number;
}): DraftSession {
  const now = opts.now ?? Date.now();
  return {
    id: uuid(),
    user_id: opts.userId,
    template_id: opts.templateId ?? null,
    scheduled_workout_id: opts.scheduledWorkoutId ?? null,
    title: opts.title,
    status: 'in_progress',
    started_at: iso(now),
    ended_at: null,
    paused_at: null,
    paused_seconds: 0,
    notes: null,
    client_updated_at: iso(now),
    exercises: opts.plan.map((p, i) => buildExercise(p, opts.previous[p.exercise.id], i)),
    current_exercise_index: 0,
    rest: null,
  };
}

/** Bumps client_updated_at monotonically so the server always accepts the newest snapshot. */
export function touch(draft: DraftSession, now = Date.now()): DraftSession {
  const prev = Date.parse(draft.client_updated_at);
  return { ...draft, client_updated_at: iso(Math.max(now, prev + 1)) };
}

const renumber = <T extends { sort_order: number }>(items: T[]): T[] =>
  items.map((x, i) => ({ ...x, sort_order: i }));

function mapExercise(
  draft: DraftSession,
  exerciseId: string,
  fn: (e: DraftExercise) => DraftExercise,
): DraftSession {
  return { ...draft, exercises: draft.exercises.map((e) => (e.id === exerciseId ? fn(e) : e)) };
}

export type SetPatch = Partial<
  Pick<DraftSet, 'weight_kg' | 'reps' | 'rpe' | 'notes' | 'is_warmup' | 'duration_seconds'>
>;

/**
 * Applies a user edit to one set. Later sets that still hold untouched
 * suggestions follow the new weight/reps; anything the user typed is kept.
 */
export function updateSet(
  draft: DraftSession,
  exerciseId: string,
  setId: string,
  patch: SetPatch,
): DraftSession {
  return mapExercise(draft, exerciseId, (e) => {
    const index = e.sets.findIndex((s) => s.id === setId);
    if (index < 0) return e;
    const carry: SetPatch = {};
    if ('weight_kg' in patch) carry.weight_kg = patch.weight_kg;
    if ('reps' in patch) carry.reps = patch.reps;
    if ('duration_seconds' in patch) carry.duration_seconds = patch.duration_seconds;
    return {
      ...e,
      sets: e.sets.map((s, i) => {
        if (i === index) return { ...s, ...patch, prefilled: false };
        if (i > index && s.prefilled && !s.completed_at && !s.is_warmup && Object.keys(carry).length > 0) {
          return { ...s, ...carry };
        }
        return s;
      }),
    };
  });
}

export function setCompleted(
  draft: DraftSession,
  exerciseId: string,
  setId: string,
  completed: boolean,
  now = Date.now(),
): DraftSession {
  return mapExercise(draft, exerciseId, (e) => ({
    ...e,
    sets: e.sets.map((s) =>
      s.id === setId ? { ...s, completed_at: completed ? iso(now) : null, prefilled: false } : s,
    ),
  }));
}

export function addSet(draft: DraftSession, exerciseId: string): DraftSession {
  return mapExercise(draft, exerciseId, (e) => {
    const last = e.sets[e.sets.length - 1];
    const set: DraftSet = {
      ...blankSet(
        e.sets.length,
        last ? { weight_kg: last.weight_kg, reps: last.reps, duration_seconds: last.duration_seconds } : null,
      ),
      prefilled: last != null,
    };
    return { ...e, sets: [...e.sets, set] };
  });
}

export function removeSet(draft: DraftSession, exerciseId: string, setId: string): DraftSession {
  const next = mapExercise(draft, exerciseId, (e) => ({
    ...e,
    sets: renumber(e.sets.filter((s) => s.id !== setId)),
  }));
  return draft.rest?.set_id === setId ? { ...next, rest: null } : next;
}

export function addExercise(
  draft: DraftSession,
  plan: PlannedExercise,
  previous: PreviousSet[] | undefined,
): DraftSession {
  const exercises = [...draft.exercises, buildExercise(plan, previous, draft.exercises.length)];
  return { ...draft, exercises, current_exercise_index: exercises.length - 1 };
}

export function removeExercise(draft: DraftSession, exerciseId: string): DraftSession {
  const exercises = renumber(draft.exercises.filter((e) => e.id !== exerciseId));
  return {
    ...draft,
    exercises,
    current_exercise_index: Math.min(draft.current_exercise_index, Math.max(0, exercises.length - 1)),
  };
}

export function moveExercise(draft: DraftSession, from: number, to: number): DraftSession {
  if (from === to || from < 0 || to < 0 || from >= draft.exercises.length || to >= draft.exercises.length)
    return draft;
  const exercises = [...draft.exercises];
  const [moved] = exercises.splice(from, 1);
  exercises.splice(to, 0, moved!);
  const currentId = draft.exercises[draft.current_exercise_index]?.id;
  const renumbered = renumber(exercises);
  return {
    ...draft,
    exercises: renumbered,
    current_exercise_index: Math.max(
      0,
      renumbered.findIndex((e) => e.id === currentId),
    ),
  };
}

/**
 * Swaps the movement (e.g. machine busy). Completed sets stay as logged;
 * remaining sets take suggestions from the new exercise's history.
 */
export function substituteExercise(
  draft: DraftSession,
  exerciseId: string,
  replacement: ExerciseInfo,
  previous: PreviousSet[] | undefined,
): DraftSession {
  return mapExercise(draft, exerciseId, (e) => ({
    ...e,
    substituted_for_exercise_id: e.substituted_for_exercise_id ?? e.exercise_id,
    exercise_id: replacement.id,
    exercise_name_snapshot: replacement.name,
    primary_muscles_snapshot: replacement.primary_muscles,
    equipment: replacement.equipment,
    is_bodyweight: replacement.is_bodyweight,
    sets: e.sets.map((s, i) => {
      if (s.completed_at) return s;
      const prev = previousFor(previous, i);
      return {
        ...s,
        weight_kg: prev?.weight_kg ?? null,
        reps: prev?.reps ?? null,
        duration_seconds: prev?.duration_seconds ?? null,
        prefilled: prev != null,
      };
    }),
  }));
}

export const goToExercise = (draft: DraftSession, index: number): DraftSession => ({
  ...draft,
  current_exercise_index: Math.min(Math.max(0, index), Math.max(0, draft.exercises.length - 1)),
});

// ---------------------------------------------------------------------------
// Session timer (timestamp-based: survives backgrounding and reloads)
// ---------------------------------------------------------------------------

export function elapsedSeconds(draft: DraftSession, now = Date.now()): number {
  const end = draft.ended_at
    ? Date.parse(draft.ended_at)
    : draft.paused_at
      ? Date.parse(draft.paused_at)
      : now;
  return Math.max(0, Math.floor((end - Date.parse(draft.started_at)) / 1000) - draft.paused_seconds);
}

export function pauseSession(draft: DraftSession, now = Date.now()): DraftSession {
  if (draft.paused_at || draft.status !== 'in_progress') return draft;
  const rest = draft.rest?.ends_at
    ? { ...draft.rest, ends_at: null, paused_remaining_ms: Math.max(0, draft.rest.ends_at - now) }
    : draft.rest;
  return { ...draft, paused_at: iso(now), rest };
}

export function resumeSession(draft: DraftSession, now = Date.now()): DraftSession {
  if (!draft.paused_at) return draft;
  const pausedFor = Math.max(0, Math.floor((now - Date.parse(draft.paused_at)) / 1000));
  const rest =
    draft.rest && draft.rest.ends_at == null
      ? { ...draft.rest, ends_at: now + (draft.rest.paused_remaining_ms ?? 0), paused_remaining_ms: null }
      : draft.rest;
  return { ...draft, paused_at: null, paused_seconds: draft.paused_seconds + pausedFor, rest };
}

export function finishSession(draft: DraftSession, now = Date.now()): DraftSession {
  const resumed = resumeSession(draft, now);
  return { ...resumed, status: 'completed', ended_at: iso(now), rest: null };
}

export const discardSession = (draft: DraftSession, now = Date.now()): DraftSession => ({
  ...draft,
  status: 'discarded',
  ended_at: iso(now),
  rest: null,
});

// ---------------------------------------------------------------------------
// Rest timer
// ---------------------------------------------------------------------------

export function startRest(
  draft: DraftSession,
  setId: string | null,
  seconds: number,
  now = Date.now(),
): DraftSession {
  if (seconds <= 0) return { ...draft, rest: null };
  const rest: RestTimer = {
    set_id: setId,
    duration_seconds: seconds,
    ends_at: now + seconds * 1000,
    paused_remaining_ms: null,
  };
  return { ...draft, rest };
}

export function restRemainingMs(rest: RestTimer | null, now = Date.now()): number {
  if (!rest) return 0;
  if (rest.ends_at == null) return rest.paused_remaining_ms ?? 0;
  return Math.max(0, rest.ends_at - now);
}

export function pauseRest(draft: DraftSession, now = Date.now()): DraftSession {
  if (!draft.rest || draft.rest.ends_at == null) return draft;
  return {
    ...draft,
    rest: { ...draft.rest, ends_at: null, paused_remaining_ms: restRemainingMs(draft.rest, now) },
  };
}

export function resumeRest(draft: DraftSession, now = Date.now()): DraftSession {
  if (!draft.rest || draft.rest.ends_at != null) return draft;
  return {
    ...draft,
    rest: { ...draft.rest, ends_at: now + (draft.rest.paused_remaining_ms ?? 0), paused_remaining_ms: null },
  };
}

export function extendRest(draft: DraftSession, seconds: number, now = Date.now()): DraftSession {
  if (!draft.rest) return draft;
  const rest = draft.rest;
  if (rest.ends_at == null) {
    return {
      ...draft,
      rest: { ...rest, paused_remaining_ms: (rest.paused_remaining_ms ?? 0) + seconds * 1000 },
    };
  }
  return {
    ...draft,
    rest: {
      ...rest,
      duration_seconds: rest.duration_seconds + seconds,
      ends_at: Math.max(rest.ends_at, now) + seconds * 1000,
    },
  };
}

export const skipRest = (draft: DraftSession): DraftSession => ({ ...draft, rest: null });

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export function sessionStats(draft: DraftSession) {
  let sets = 0;
  let volume = 0;
  let reps = 0;
  for (const e of draft.exercises) {
    for (const s of e.sets) {
      if (!s.completed_at || s.is_warmup || !s.reps) continue;
      sets += 1;
      reps += s.reps;
      volume += (s.weight_kg ?? 0) * s.reps;
    }
  }
  return { sets, reps, volumeKg: Math.round(volume * 100) / 100 };
}

/** Estimated one-rep max (Epley). Only meaningful for 1–12 reps; returns null otherwise. */
export function estimateOneRepMax(weightKg: number | null, reps: number | null): number | null {
  if (!weightKg || !reps || reps < 1 || reps > 12) return null;
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 100) / 100;
}

/** "3 × 10", "2 sets AMRAP", "5 rounds × 30s+" */
export function targetLabel(
  e: Pick<DraftExercise, 'rep_mode' | 'rep_min' | 'rep_max' | 'duration_seconds_min'> & {
    sets: { is_warmup: boolean }[];
  },
) {
  const sets = e.sets.filter((s) => !s.is_warmup).length;
  if (e.rep_mode === 'amrap') return `${sets} ${sets === 1 ? 'set' : 'sets'} AMRAP`;
  if (e.rep_mode === 'timed')
    return `${sets} ${sets === 1 ? 'round' : 'rounds'} × ${e.duration_seconds_min ?? '?'}s+`;
  if (e.rep_min && e.rep_max)
    return `${sets} × ${e.rep_min === e.rep_max ? e.rep_min : `${e.rep_min}–${e.rep_max}`}`;
  return `${sets} sets`;
}
