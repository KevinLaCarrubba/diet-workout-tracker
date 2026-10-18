import { describe, expect, it } from 'vitest';
import type { DraftSession } from '@/offline/types';
import {
  draftToDetail,
  exerciseBadges,
  formatMinutes,
  mergeHistory,
  pickDetail,
  serverToDetail,
  serverToHistoryItem,
  type HistoryItem,
  type ServerSessionDetail,
} from './historyModel';

function draft(id: string, startedAt: string, status: DraftSession['status'] = 'completed'): DraftSession {
  return {
    id,
    user_id: 'u1',
    template_id: null,
    scheduled_workout_id: null,
    title: `Draft ${id}`,
    status,
    started_at: startedAt,
    ended_at: new Date(Date.parse(startedAt) + 3600_000).toISOString(),
    paused_at: null,
    paused_seconds: 600,
    notes: 'felt good',
    client_updated_at: startedAt,
    current_exercise_index: 0,
    rest: null,
    exercises: [
      {
        id: `${id}-e2`,
        exercise_id: 'bench',
        substituted_for_exercise_id: null,
        sort_order: 1,
        exercise_name_snapshot: 'Bench Press',
        primary_muscles_snapshot: [],
        equipment: null,
        is_bodyweight: false,
        rest_seconds: 90,
        rep_min: 8,
        rep_max: 10,
        rep_mode: 'reps',
        duration_seconds_min: null,
        group_name: 'Chest',
        tempo: '2-1-2-0',
        alternatives: [],
        notes: null,
        sets: [
          {
            id: 's2',
            sort_order: 1,
            weight_kg: 60,
            reps: 8,
            rpe: 8,
            duration_seconds: null,
            is_warmup: false,
            completed_at: startedAt,
            notes: null,
            prefilled: false,
          },
          {
            id: 's1',
            sort_order: 0,
            weight_kg: 40,
            reps: 10,
            rpe: null,
            duration_seconds: null,
            is_warmup: true,
            completed_at: startedAt,
            notes: null,
            prefilled: false,
          },
        ],
      },
      {
        id: `${id}-e1`,
        exercise_id: 'squat',
        substituted_for_exercise_id: null,
        sort_order: 0,
        exercise_name_snapshot: 'Squat',
        primary_muscles_snapshot: [],
        equipment: null,
        is_bodyweight: false,
        rest_seconds: 90,
        rep_min: 5,
        rep_max: 5,
        rep_mode: 'reps',
        duration_seconds_min: null,
        group_name: null,
        tempo: null,
        alternatives: [],
        notes: null,
        sets: [
          {
            id: 's3',
            sort_order: 0,
            weight_kg: 100,
            reps: 5,
            rpe: null,
            duration_seconds: null,
            is_warmup: false,
            completed_at: startedAt,
            notes: null,
            prefilled: false,
          },
        ],
      },
    ],
  };
}

const serverItem = (id: string, started: string): HistoryItem => ({
  id,
  title: id,
  started_at: started,
  duration_seconds: 3000,
  total_sets: 10,
  total_volume_kg: 1000,
  pr_count: 0,
  pending: false,
});

describe('serverToHistoryItem', () => {
  it('reads the embedded PR count and numeric volume', () => {
    const item = serverToHistoryItem({
      id: 'a',
      title: 'Push',
      started_at: '2026-10-01T10:00:00Z',
      duration_seconds: 3600,
      total_sets: 12,
      total_volume_kg: '1234.5' as unknown as number,
      personal_records: [{ count: 3 }],
    });
    expect(item).toMatchObject({ pr_count: 3, total_volume_kg: 1234.5, pending: false });
  });
});

describe('mergeHistory', () => {
  it('adds pending device workouts, newest first, and prefers the server copy', () => {
    const server = [serverItem('s1', '2026-10-10T10:00:00Z'), serverItem('s2', '2026-10-05T10:00:00Z')];
    const drafts = [
      draft('local', '2026-10-12T10:00:00Z'),
      draft('s1', '2026-10-10T10:00:00Z'),
      draft('synced-elsewhere', '2026-09-01T10:00:00Z'),
      draft('running', '2026-10-13T10:00:00Z', 'in_progress'),
    ];
    const merged = mergeHistory(server, drafts, new Set(['local', 's1', 'running']));
    expect(merged.map((m) => m.id)).toEqual(['local', 's1', 's2']);
    expect(merged[0]).toMatchObject({
      pending: true,
      total_sets: 2,
      total_volume_kg: 980,
      duration_seconds: 3000,
    });
    expect(merged[1]!.pending).toBe(false);
  });
});

describe('detail normalisation', () => {
  it('sorts device exercises and sets by sort_order', () => {
    const d = draftToDetail(draft('x', '2026-10-12T10:00:00Z'));
    expect(d.source).toBe('device');
    expect(d.exercises.map((e) => e.exercise_name_snapshot)).toEqual(['Squat', 'Bench Press']);
    expect(d.exercises[1]!.sets.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(d.notes).toBe('felt good');
  });

  it('converts server numerics and records', () => {
    const row = {
      id: 'srv',
      user_id: 'u1',
      title: 'Legs',
      status: 'completed',
      started_at: '2026-10-01T10:00:00Z',
      ended_at: '2026-10-01T11:00:00Z',
      duration_seconds: 3600,
      total_sets: 1,
      total_volume_kg: '500.00',
      notes: null,
      exercises: [
        {
          id: 'e',
          sort_order: 0,
          exercise_id: 'squat',
          substituted_for_exercise_id: 'leg-press',
          exercise_name_snapshot: 'Squat',
          rep_mode: 'amrap',
          rep_min: null,
          rep_max: null,
          duration_seconds_min: null,
          group_name: null,
          tempo: null,
          notes: null,
          sets: [
            {
              id: 's',
              sort_order: 0,
              weight_kg: '100.00',
              reps: 5,
              rpe: '8.5',
              duration_seconds: null,
              is_warmup: false,
              completed_at: 'x',
              notes: null,
            },
          ],
        },
      ],
    } as unknown as ServerSessionDetail;
    const d = serverToDetail(row, [
      { exercise_id: 'squat', record_type: 'estimated_1rm', value: 116.67, weight_kg: null, reps: null },
    ]);
    expect(d.total_volume_kg).toBe(500);
    expect(d.exercises[0]!.rep_mode).toBe('amrap');
    expect(d.exercises[0]!.sets[0]).toMatchObject({ weight_kg: 100, rpe: 8.5 });
    expect(d.records).toHaveLength(1);
  });
});

describe('pickDetail', () => {
  const server = draftToDetail(draft('s', '2026-10-01T10:00:00Z'));
  const serverCopy = { ...server, source: 'server' as const, title: 'server' };
  const local = draft('s', '2026-10-01T10:00:00Z');

  it('uses the device copy while its upload is pending', () => {
    expect(pickDetail(serverCopy, local, true)?.source).toBe('device');
  });
  it('uses the server copy once synced', () => {
    expect(pickDetail(serverCopy, local, false)?.title).toBe('server');
  });
  it('falls back to the device copy when the server has none', () => {
    expect(pickDetail(null, local, false)?.source).toBe('device');
    expect(pickDetail(null, undefined, false)).toBeNull();
  });
  it('ignores discarded drafts', () => {
    expect(pickDetail(null, { ...local, status: 'discarded' }, true)).toBeNull();
  });
});

describe('small formatters', () => {
  it('formats minutes and badges', () => {
    expect(formatMinutes(null)).toBe('–');
    expect(formatMinutes(45)).toBe('45s');
    expect(formatMinutes(3150)).toBe('53 min');
    expect(exerciseBadges({ group_name: 'Chest', tempo: '2-1-2-0' })).toEqual(['Chest', 'Tempo 2-1-2-0']);
    expect(exerciseBadges({ group_name: null, tempo: null })).toEqual([]);
  });
});
