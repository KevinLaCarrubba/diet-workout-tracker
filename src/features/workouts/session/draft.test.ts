import { describe, expect, it } from 'vitest';
import {
  addSet,
  createDraft,
  elapsedSeconds,
  estimateOneRepMax,
  extendRest,
  finishSession,
  moveExercise,
  pauseRest,
  pauseSession,
  removeSet,
  restRemainingMs,
  resumeRest,
  resumeSession,
  sessionStats,
  setCompleted,
  startRest,
  substituteExercise,
  touch,
  updateSet,
  type PlannedExercise,
} from './draft';

const T0 = Date.parse('2026-10-18T10:00:00Z');
const bench = {
  id: 'bench',
  name: 'Bench Press',
  primary_muscles: ['chest'],
  equipment: 'Barbell',
  is_bodyweight: false,
};
const squat = {
  id: 'squat',
  name: 'Squat',
  primary_muscles: ['quads'],
  equipment: 'Barbell',
  is_bodyweight: false,
};
const plan: PlannedExercise[] = [
  { exercise: bench, target_sets: 3, rep_min: 8, rep_max: 10, rest_seconds: 120 },
  { exercise: squat, target_sets: 2, rep_min: 5, rep_max: 8, rest_seconds: 180 },
];

function draft() {
  return createDraft({
    userId: 'u1',
    title: 'Push',
    plan,
    previous: {
      bench: [
        { weight_kg: 60, reps: 10 },
        { weight_kg: 60, reps: 8 },
      ],
    },
    now: T0,
  });
}

describe('creating a workout', () => {
  it('prefills sets from the previous session, reusing the last set when there were fewer', () => {
    const d = draft();
    const sets = d.exercises[0]!.sets;
    expect(sets.map((s) => [s.weight_kg, s.reps, s.prefilled])).toEqual([
      [60, 10, true],
      [60, 8, true],
      [60, 8, true],
    ]);
    expect(d.exercises[1]!.sets.every((s) => s.weight_kg === null && !s.prefilled)).toBe(true);
  });
});

describe('editing sets', () => {
  it('carries an edited weight to later untouched sets but never overwrites user edits', () => {
    let d = draft();
    const [s1, s2, s3] = d.exercises[0]!.sets;
    d = updateSet(d, d.exercises[0]!.id, s3!.id, { weight_kg: 55 }); // user edit on set 3
    d = updateSet(d, d.exercises[0]!.id, s1!.id, { weight_kg: 62.5 });
    const sets = d.exercises[0]!.sets;
    expect(sets[0]).toMatchObject({ weight_kg: 62.5, prefilled: false });
    expect(sets[1]).toMatchObject({ id: s2!.id, weight_kg: 62.5, reps: 8, prefilled: true });
    expect(sets[2]).toMatchObject({ weight_kg: 55, prefilled: false });
  });

  it('does not change completed sets', () => {
    let d = draft();
    const ex = d.exercises[0]!;
    d = setCompleted(d, ex.id, ex.sets[1]!.id, true, T0 + 60_000);
    d = updateSet(d, ex.id, ex.sets[0]!.id, { reps: 12 });
    expect(d.exercises[0]!.sets[1]).toMatchObject({ reps: 8, completed_at: '2026-10-18T10:01:00.000Z' });
  });

  it('adds sets copying the last one and renumbers after removal', () => {
    let d = draft();
    const ex = d.exercises[0]!;
    d = addSet(d, ex.id);
    expect(d.exercises[0]!.sets).toHaveLength(4);
    expect(d.exercises[0]!.sets[3]).toMatchObject({
      weight_kg: 60,
      reps: 8,
      sort_order: 3,
      completed_at: null,
    });
    d = removeSet(d, ex.id, ex.sets[0]!.id);
    expect(d.exercises[0]!.sets.map((s) => s.sort_order)).toEqual([0, 1, 2]);
  });
});

describe('exercises', () => {
  it('reorders while keeping the current exercise selected', () => {
    let d = { ...draft(), current_exercise_index: 1 };
    d = moveExercise(d, 1, 0);
    expect(d.exercises.map((e) => e.exercise_id)).toEqual(['squat', 'bench']);
    expect(d.exercises.map((e) => e.sort_order)).toEqual([0, 1]);
    expect(d.current_exercise_index).toBe(0);
  });

  it('substitutes an exercise, keeping completed sets and remembering the original', () => {
    let d = draft();
    const ex = d.exercises[0]!;
    d = setCompleted(d, ex.id, ex.sets[0]!.id, true, T0);
    const db = {
      id: 'db-bench',
      name: 'DB Bench',
      primary_muscles: ['chest'],
      equipment: 'Dumbbells',
      is_bodyweight: false,
    };
    d = substituteExercise(d, ex.id, db, [{ weight_kg: 25, reps: 12 }]);
    const after = d.exercises[0]!;
    expect(after).toMatchObject({ exercise_id: 'db-bench', substituted_for_exercise_id: 'bench' });
    expect(after.sets.map((s) => s.weight_kg)).toEqual([60, 25, 25]);
  });
});

describe('timers', () => {
  it('computes elapsed time from timestamps, excluding pauses', () => {
    let d = draft();
    expect(elapsedSeconds(d, T0 + 125_000)).toBe(125);
    d = pauseSession(d, T0 + 60_000);
    expect(elapsedSeconds(d, T0 + 600_000)).toBe(60);
    d = resumeSession(d, T0 + 120_000);
    expect(elapsedSeconds(d, T0 + 180_000)).toBe(120);
    d = finishSession(d, T0 + 240_000);
    expect(elapsedSeconds(d, T0 + 999_000)).toBe(180);
    expect(d.status).toBe('completed');
  });

  it('runs the rest timer from an absolute end time with pause, resume and +30s', () => {
    let d = startRest(draft(), 'set-1', 90, T0);
    expect(restRemainingMs(d.rest, T0 + 30_000)).toBe(60_000);
    d = pauseRest(d, T0 + 30_000);
    expect(restRemainingMs(d.rest, T0 + 500_000)).toBe(60_000);
    d = resumeRest(d, T0 + 100_000);
    expect(restRemainingMs(d.rest, T0 + 110_000)).toBe(50_000);
    d = extendRest(d, 30, T0 + 110_000);
    expect(restRemainingMs(d.rest, T0 + 110_000)).toBe(80_000);
    expect(restRemainingMs(d.rest, T0 + 999_000)).toBe(0);
  });

  it('keeps client_updated_at strictly increasing', () => {
    const d = draft();
    const a = touch(d, T0);
    const b = touch(a, T0 - 5000);
    expect(Date.parse(b.client_updated_at)).toBeGreaterThan(Date.parse(a.client_updated_at));
  });
});

describe('stats', () => {
  it('counts completed working sets and volume', () => {
    let d = draft();
    const ex = d.exercises[0]!;
    d = setCompleted(d, ex.id, ex.sets[0]!.id, true, T0);
    d = setCompleted(d, ex.id, ex.sets[1]!.id, true, T0);
    expect(sessionStats(d)).toEqual({ sets: 2, reps: 18, volumeKg: 1080 });
  });

  it('labels estimated 1RM only for low rep sets', () => {
    expect(estimateOneRepMax(100, 5)).toBe(116.67);
    expect(estimateOneRepMax(100, 1)).toBe(100);
    expect(estimateOneRepMax(100, 20)).toBeNull();
  });
});

describe('coach prescriptions', () => {
  it('describes reps, AMRAP and timed targets', async () => {
    const { targetLabel } = await import('./draft');
    const d = createDraft({
      userId: 'u1',
      title: 'Coach',
      previous: {},
      plan: [
        {
          exercise: bench,
          target_sets: 3,
          rep_min: 10,
          rep_max: 10,
          rest_seconds: 60,
          tempo: '2-3-1-0',
          group_name: 'Chest',
        },
        { exercise: bench, target_sets: 2, rep_min: 1, rep_max: 1, rest_seconds: 60, rep_mode: 'amrap' },
        {
          exercise: squat,
          target_sets: 5,
          rep_min: 1,
          rep_max: 1,
          rest_seconds: 60,
          rep_mode: 'timed',
          duration_seconds_min: 30,
        },
      ],
    });
    expect(d.exercises.map(targetLabel)).toEqual(['3 × 10', '2 sets AMRAP', '5 rounds × 30s+']);
    expect(d.exercises[0]).toMatchObject({ tempo: '2-3-1-0', group_name: 'Chest' });
    expect(d.exercises[1]).toMatchObject({ rep_min: null, rep_max: null }); // AMRAP has no fixed target
  });

  it('carries a logged hold duration to later untouched timed sets', () => {
    let d = createDraft({
      userId: 'u1',
      title: 'Legs',
      previous: { squat: [{ weight_kg: null, reps: null, duration_seconds: 35 }] },
      plan: [
        {
          exercise: squat,
          target_sets: 3,
          rep_min: 1,
          rep_max: 1,
          rest_seconds: 60,
          rep_mode: 'timed',
          duration_seconds_min: 30,
        },
      ],
    });
    expect(d.exercises[0]!.sets.map((s) => s.duration_seconds)).toEqual([35, 35, 35]);
    d = updateSet(d, d.exercises[0]!.id, d.exercises[0]!.sets[0]!.id, { duration_seconds: 42 });
    expect(d.exercises[0]!.sets.map((s) => s.duration_seconds)).toEqual([42, 42, 42]);
  });
});
