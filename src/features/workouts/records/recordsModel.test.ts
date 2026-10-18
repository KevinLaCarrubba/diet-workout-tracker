import { describe, expect, it } from 'vitest';
import { estimateOneRepMax as fromDraft } from '../session/draft';
import { describeRecord } from './recordFormat';
import {
  bestRecordsByExercise,
  estimateOneRepMax,
  filterByName,
  progressionFromRows,
  type PersonalRecordRow,
  type ProgressionRow,
} from './recordsModel';

describe('estimateOneRepMax (Epley)', () => {
  it('matches the workout draft helper', () => {
    expect(estimateOneRepMax).toBe(fromDraft);
  });
  it('returns the weight for a single and Epley for 2–12 reps', () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
    expect(estimateOneRepMax(100, 5)).toBe(116.67);
    expect(estimateOneRepMax(100, 12)).toBe(140);
  });
  it('is null outside 1–12 reps or without weight', () => {
    expect(estimateOneRepMax(100, 13)).toBeNull();
    expect(estimateOneRepMax(100, 0)).toBeNull();
    expect(estimateOneRepMax(null, 5)).toBeNull();
    expect(estimateOneRepMax(0, 5)).toBeNull();
  });
});

const rec = (
  p: Partial<PersonalRecordRow> & Pick<PersonalRecordRow, 'record_type' | 'value'>,
): PersonalRecordRow => ({
  id: Math.random().toString(36),
  exercise_id: 'bench',
  weight_kg: null,
  reps: null,
  achieved_at: '2026-10-01T10:00:00Z',
  source_session_id: 's1',
  exercise: { name: 'Bench Press' },
  ...p,
});

describe('bestRecordsByExercise', () => {
  const rows: PersonalRecordRow[] = [
    rec({ record_type: 'max_weight', value: 80, weight_kg: 80 }),
    rec({
      record_type: 'max_weight',
      value: 90,
      weight_kg: 90,
      achieved_at: '2026-10-08T10:00:00Z',
      source_session_id: 's2',
    }),
    rec({ record_type: 'estimated_1rm', value: 100 }),
    rec({ record_type: 'max_reps_at_weight', value: 8, reps: 8, weight_kg: 60 }),
    rec({
      record_type: 'max_reps_at_weight',
      value: 10,
      reps: 10,
      weight_kg: 60,
      achieved_at: '2026-10-08T10:00:00Z',
    }),
    rec({
      record_type: 'max_reps_at_weight',
      value: 10,
      reps: 10,
      weight_kg: 70,
      achieved_at: '2026-10-09T10:00:00Z',
    }),
    rec({ record_type: 'session_volume', value: 2400 }),
    rec({
      exercise_id: 'squat',
      exercise: { name: 'Back Squat' },
      record_type: 'max_weight',
      value: 140,
      weight_kg: 140,
    }),
  ];

  it('keeps the best of each kind per exercise, sorted by name', () => {
    const result = bestRecordsByExercise(rows);
    expect(result.map((r) => r.name)).toEqual(['Back Squat', 'Bench Press']);
    const bench = result[1]!;
    expect(bench.best.max_weight).toMatchObject({ value: 90, source_session_id: 's2' });
    expect(bench.best.estimated_1rm?.value).toBe(100);
    expect(bench.best.session_volume?.value).toBe(2400);
    expect(bench.last_achieved_at).toBe('2026-10-09T10:00:00Z');
  });

  it('tracks most reps per weight; headline prefers more reps then heavier weight', () => {
    const bench = bestRecordsByExercise(rows)[1]!;
    expect(bench.repsAtWeight.map((r) => [r.weight_kg, r.reps])).toEqual([
      [70, 10],
      [60, 10],
    ]);
    expect(bench.best.max_reps_at_weight).toMatchObject({ weight_kg: 70, reps: 10 });
  });

  it('falls back to the provided names map', () => {
    const [only] = bestRecordsByExercise(
      [rec({ record_type: 'max_weight', value: 1, exercise: null })],
      new Map([['bench', 'Bench']]),
    );
    expect(only!.name).toBe('Bench');
  });
});

describe('filterByName', () => {
  it('matches case-insensitively and ignores blank queries', () => {
    const items = [{ name: 'Bench Press' }, { name: 'Back Squat' }];
    expect(filterByName(items, ' ')).toHaveLength(2);
    expect(filterByName(items, 'squat')).toEqual([{ name: 'Back Squat' }]);
  });
});

describe('progressionFromRows', () => {
  const set = (
    weight_kg: number | string | null,
    reps: number | null,
    extra: Partial<{ is_warmup: boolean; completed_at: string | null }> = {},
  ) => ({
    weight_kg,
    reps,
    is_warmup: false,
    completed_at: '2026-10-01T10:00:00Z',
    ...extra,
  });

  it('takes the best completed working set per completed session, oldest first', () => {
    const rows: ProgressionRow[] = [
      {
        session: { id: 'b', started_at: '2026-10-08T10:00:00Z', status: 'completed' },
        sets: [
          set('100.00', 5),
          set(110, 1),
          set(200, 3, { is_warmup: true }),
          set(300, 1, { completed_at: null }),
        ],
      },
      { session: { id: 'a', started_at: '2026-10-01T10:00:00Z', status: 'completed' }, sets: [set(90, 10)] },
      // Same session split across two exercise rows (e.g. added twice).
      { session: { id: 'a', started_at: '2026-10-01T10:00:00Z', status: 'completed' }, sets: [set(95, 8)] },
      {
        session: { id: 'c', started_at: '2026-10-09T10:00:00Z', status: 'in_progress' },
        sets: [set(150, 5)],
      },
      { session: { id: 'd', started_at: '2026-10-10T10:00:00Z', status: 'completed' }, sets: [set(50, 20)] },
      { session: null, sets: [set(150, 5)] },
    ];
    const points = progressionFromRows(rows);
    expect(points.map((p) => p.session_id)).toEqual(['a', 'b']);
    expect(points[0]).toMatchObject({ e1rm_kg: 120.33, weight_kg: 95, reps: 8 });
    expect(points[1]).toMatchObject({ e1rm_kg: 116.67, weight_kg: 100, reps: 5 });
  });
});

describe('describeRecord', () => {
  it('labels estimates and uses the user units', () => {
    expect(
      describeRecord({ record_type: 'estimated_1rm', value: 100, weight_kg: null, reps: null }, 'metric'),
    ).toBe('≈ 100 kg (estimated)');
    expect(
      describeRecord(
        { record_type: 'max_reps_at_weight', value: 10, weight_kg: 45.36, reps: 10 },
        'imperial',
      ),
    ).toBe('10 reps @ 100 lb');
  });
});
