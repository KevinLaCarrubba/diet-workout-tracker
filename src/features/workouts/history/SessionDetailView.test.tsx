import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import type { SessionDetail } from './historyModel';
import { SessionDetailView } from './SessionDetailView';

const set = (id: string, extra: Partial<SessionDetail['exercises'][number]['sets'][number]> = {}) => ({
  id,
  sort_order: 0,
  weight_kg: null,
  reps: null,
  rpe: null,
  duration_seconds: null,
  is_warmup: false,
  completed_at: '2026-10-01T10:00:00Z',
  notes: null,
  ...extra,
});

const detail: SessionDetail = {
  id: 's',
  title: 'Upper',
  status: 'completed',
  started_at: '2026-10-01T14:00:00Z',
  ended_at: '2026-10-01T15:00:00Z',
  duration_seconds: 3600,
  total_sets: 3,
  total_volume_kg: 1000,
  notes: 'Shoulder felt fine',
  source: 'server',
  records: [
    { exercise_id: 'bench', record_type: 'estimated_1rm', value: 116.67, weight_kg: null, reps: null },
  ],
  exercises: [
    {
      id: 'e1',
      exercise_id: 'bench',
      substituted_for_exercise_id: 'db-press',
      sort_order: 0,
      exercise_name_snapshot: 'Bench Press',
      rep_mode: 'amrap',
      rep_min: null,
      rep_max: null,
      duration_seconds_min: null,
      group_name: 'Chest',
      tempo: '2-1-2-0',
      notes: 'Control the eccentric',
      sets: [
        set('w', { is_warmup: true, weight_kg: 40, reps: 10 }),
        set('a', { sort_order: 1, weight_kg: 100, reps: 5, rpe: 9, notes: 'grindy' }),
        set('b', { sort_order: 2, completed_at: null }),
      ],
    },
    {
      id: 'e2',
      exercise_id: 'wall-sit',
      substituted_for_exercise_id: null,
      sort_order: 1,
      exercise_name_snapshot: 'Wall Sit',
      rep_mode: 'timed',
      rep_min: null,
      rep_max: null,
      duration_seconds_min: 30,
      group_name: null,
      tempo: null,
      notes: null,
      sets: [set('t', { duration_seconds: 45 })],
    },
  ],
};

describe('SessionDetailView', () => {
  it('shows sets, prescription, badges and clearly-labelled estimates', () => {
    renderWithProviders(
      <SessionDetailView
        detail={detail}
        units="metric"
        timezone="America/New_York"
        names={new Map([['db-press', 'Dumbbell Press']])}
      />,
    );
    expect(screen.getByText('Thursday, Oct 1, 2026 · 10:00 AM')).toBeInTheDocument();
    expect(screen.getByText('2 sets AMRAP')).toBeInTheDocument();
    expect(screen.getByText('1 round × 30s+')).toBeInTheDocument();
    expect(screen.getByText('Tempo 2-1-2-0')).toBeInTheDocument();
    expect(screen.getByText('Chest')).toBeInTheDocument();
    expect(screen.getByText('Swapped in for Dumbbell Press')).toBeInTheDocument();
    expect(screen.getByText('100 kg × 5')).toBeInTheDocument();
    expect(screen.getByText('RPE 9')).toBeInTheDocument();
    expect(screen.getByText('grindy')).toBeInTheDocument();
    expect(screen.getByText('warm-up')).toBeInTheDocument();
    expect(screen.getByText('AMRAP')).toBeInTheDocument();
    expect(screen.getByText('45s')).toBeInTheDocument();
    expect(screen.getByText('1 planned set not logged')).toBeInTheDocument();
    expect(screen.getByText('≈ 116.7 kg (estimated)')).toBeInTheDocument();
    expect(screen.getByText(/not a tested max/)).toBeInTheDocument();
    expect(screen.getByText('Shoulder felt fine')).toBeInTheDocument();
  });
});
