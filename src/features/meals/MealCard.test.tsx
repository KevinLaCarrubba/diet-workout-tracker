import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import type { MealOccurrence, MealSchedule } from './logic';
import { MealCard, type MealCardActions } from './MealCard';

const meal: MealOccurrence = {
  id: 'o1',
  user_id: 'u1',
  schedule_id: 's1',
  local_date: '2026-10-18',
  local_time: '09:00:00',
  scheduled_at: '2026-10-18T13:00:00.000Z',
  label_snapshot: 'Meal 2',
  description_snapshot: 'Beef',
  notes: null,
  status: 'pending',
  completed_at: null,
  rescheduled_from: null,
  created_at: '',
  updated_at: '',
  meal_number: 2,
  display_order: 3,
  items_snapshot: [{ text: '6 oz 90% lean beef' }, { text: '1 cucumber', optional: true }],
  coach_note_snapshot: 'No rice or other side required.',
  snoozed_until: null,
};

const actions = (): MealCardActions => ({
  onAte: vi.fn(),
  onSkip: vi.fn(),
  onSnooze: vi.fn(),
  onUndo: vi.fn(),
  onReschedule: vi.fn(),
  onEditNote: vi.fn(),
});

const now = new Date('2026-10-18T13:05:00Z');

describe('MealCard', () => {
  it('shows the plan details and handles Ate / Skip / Snooze', async () => {
    const user = userEvent.setup();
    const a = actions();
    renderWithProviders(<MealCard meal={meal} timezone="America/New_York" now={now} isNext actions={a} />);

    expect(screen.getByText('Meal 2 · 9:00 AM')).toBeInTheDocument();
    expect(screen.getByText('Up next')).toBeInTheDocument();
    expect(screen.getByText('6 oz 90% lean beef')).toBeInTheDocument();
    expect(screen.getByText('optional')).toBeInTheDocument();
    expect(screen.getByText('No rice or other side required.')).toBeInTheDocument();
    expect(screen.queryByText(/timing conflict/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ate' }));
    expect(a.onAte).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(a.onSkip).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Snooze' }));
    await user.click(await screen.findByRole('menuitem', { name: '30 minutes' }));
    expect(a.onSnooze).toHaveBeenCalledWith(30);
  });

  it('offers Undo for a marked meal and flags timing conflicts', async () => {
    const user = userEvent.setup();
    const a = actions();
    const schedule = {
      needs_confirmation: true,
      confirmation_note: 'Conflicts with a 5 AM gym start',
    } as MealSchedule;
    renderWithProviders(
      <MealCard
        meal={{ ...meal, status: 'eaten', completed_at: '2026-10-18T13:12:00Z' }}
        schedule={schedule}
        timezone="America/New_York"
        now={now}
        actions={a}
      />,
    );

    expect(screen.getByText('Eaten at 9:12 AM')).toBeInTheDocument();
    expect(screen.getByText('Timing conflict — confirm with coach')).toBeInTheDocument();
    expect(screen.getByText('Conflicts with a 5 AM gym start')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ate' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(a.onUndo).toHaveBeenCalledOnce();
  });
});
