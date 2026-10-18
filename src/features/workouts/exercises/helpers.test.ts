import { describe, expect, it } from 'vitest';
import {
  byMuscle,
  exerciseErrorMessage,
  formatHistorySet,
  muscleGroups,
  summarizeHistory,
  type HistoryRow,
  type HistorySet,
} from './helpers';

const set = (over: Partial<HistorySet>): HistorySet => ({
  id: crypto.randomUUID(),
  sort_order: 0,
  weight_kg: null,
  reps: null,
  duration_seconds: null,
  is_warmup: false,
  completed_at: '2026-10-01T10:00:00Z',
  ...over,
});

describe('muscle groups', () => {
  it('lists distinct lower-cased muscles and filters by them', () => {
    const list = [
      { primary_muscles: ['Chest', 'triceps'] },
      { primary_muscles: ['chest'] },
      { primary_muscles: [] },
    ];
    expect(muscleGroups(list)).toEqual(['chest', 'triceps']);
    expect(byMuscle(list, 'chest')).toHaveLength(2);
    expect(byMuscle(list, null)).toHaveLength(3);
  });
});

describe('exerciseErrorMessage', () => {
  it('explains foreign-key and duplicate-name failures', () => {
    expect(exerciseErrorMessage({ code: '23503', message: 'fk' })).toMatch(/used in one of your templates/);
    expect(exerciseErrorMessage({ code: '23505' })).toMatch(/already have/);
    expect(exerciseErrorMessage(new Error('boom'))).toBe('boom');
  });
});

describe('summarizeHistory', () => {
  const session = (id: string, started_at: string, status = 'completed') => ({
    id,
    started_at,
    status,
    title: `S ${id}`,
  });

  it('keeps completed sessions with completed sets, newest first, limited', () => {
    const rows: HistoryRow[] = [
      {
        id: 'a',
        rep_mode: 'reps',
        session: session('1', '2026-10-01T10:00:00Z'),
        sets: [set({ sort_order: 1, reps: 8 }), set({ sort_order: 0, reps: 10 })],
      },
      {
        id: 'b',
        rep_mode: 'reps',
        session: session('2', '2026-10-05T10:00:00Z'),
        sets: [set({ completed_at: null })],
      },
      {
        id: 'c',
        rep_mode: 'reps',
        session: session('3', '2026-10-08T10:00:00Z', 'in_progress'),
        sets: [set({})],
      },
      { id: 'd', rep_mode: 'reps', session: session('4', '2026-10-09T10:00:00Z'), sets: [set({ reps: 5 })] },
    ];
    const out = summarizeHistory(rows, 5);
    expect(out.map((s) => s.sessionId)).toEqual(['4', '1']);
    expect(out[1]!.sets.map((s) => s.reps)).toEqual([10, 8]);
    expect(summarizeHistory(rows, 1)).toHaveLength(1);
  });

  it('merges the same exercise appearing twice in one session', () => {
    const s = session('1', '2026-10-01T10:00:00Z');
    const out = summarizeHistory([
      { id: 'a', rep_mode: 'reps', session: s, sets: [set({ reps: 1 })] },
      { id: 'b', rep_mode: 'reps', session: s, sets: [set({ reps: 2, sort_order: 1 })] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.sets).toHaveLength(2);
  });
});

describe('formatHistorySet', () => {
  it('formats weight in user units, bodyweight and timed sets', () => {
    expect(formatHistorySet(set({ weight_kg: 100, reps: 5 }), 'metric')).toBe('100 kg × 5');
    expect(formatHistorySet(set({ weight_kg: 45.359237, reps: 8 }), 'imperial')).toBe('100 lb × 8');
    expect(formatHistorySet(set({ reps: 12 }), 'metric')).toBe('BW × 12');
    expect(formatHistorySet(set({ duration_seconds: 45 }), 'metric')).toBe('45s');
  });
});
