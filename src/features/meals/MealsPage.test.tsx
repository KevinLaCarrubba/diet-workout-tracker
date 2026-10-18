import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import type { MealSchedule } from './logic';

const schedule: MealSchedule = {
  id: 's3',
  user_id: 'u1',
  label: 'Meal 3',
  description: 'Pre-workout meal',
  notes: null,
  local_time: '12:30:00',
  recurrence_weekdays: [1, 2, 3, 5, 6, 7],
  active: true,
  created_at: '',
  updated_at: '',
  meal_number: 3,
  display_order: 4,
  items: [{ text: '5.5 oz jasmine rice' }],
  coach_note: '60–90 minutes before training',
  relative_event: null,
  relative_offset_minutes: null,
  needs_confirmation: true,
  confirmation_note: 'Conflicts with the 5 AM gym start',
  import_key: null,
};

const mutation = { mutate: vi.fn(), isPending: false };

vi.mock('@/features/profile/api', () => ({
  usePreferences: () => ({ units: 'imperial', timezone: 'America/New_York', profile: undefined }),
  useSettings: () => ({ data: { water_goal_ml: 2000 }, isPending: false }),
  useUpdateSettings: () => mutation,
}));

vi.mock('./api', () => ({
  useMealSchedules: () => ({ data: [schedule], isPending: false, isError: false }),
  useMealDay: () => ({ data: { meals: [], related: [] }, isPending: false, isError: false }),
  useSaveSchedule: () => mutation,
  useDuplicateSchedule: () => mutation,
  useDeleteSchedule: () => mutation,
  useUpdateOccurrence: () => mutation,
  useRescheduleMeal: () => mutation,
  useAddAdHocMeal: () => mutation,
  useDeleteOccurrence: () => mutation,
  useWaterDay: () => ({
    isPending: false,
    entries: [{ id: 'w1', user_id: 'u1', amount_ml: 473, occurred_at: new Date().toISOString() }],
  }),
  useWaterHistory: () => ({ data: [], isPending: false, isError: false }),
  useWaterActions: () => ({ add: vi.fn(), update: vi.fn(), remove: vi.fn() }),
}));

const { MealsPage } = await import('./MealsPage');

const renderAt = (route: string) =>
  renderWithProviders(
    <Routes>
      <Route path="/meals" element={<MealsPage />} />
      <Route path="/meals/:section" element={<MealsPage />} />
    </Routes>,
    { route },
  );

describe('MealsPage', () => {
  it('shows the weekly plan with weekdays and the timing-conflict flag', async () => {
    renderAt('/meals/plan');
    expect(screen.getByText('Meal 3 · 12:30 PM')).toBeInTheDocument();
    expect(screen.getByText('Every day except Thu')).toBeInTheDocument();
    expect(screen.getByText('Timing conflict — confirm with coach')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mark resolved' }));
    expect(mutation.mutate).toHaveBeenCalledWith(
      { id: 's3', values: { needs_confirmation: false } },
      expect.anything(),
    );
  });

  it('opens water from ?tab=water with quick-add buttons in ounces', () => {
    renderAt('/meals?tab=water');
    expect(screen.getByRole('button', { name: '+8 oz' })).toBeInTheDocument();
    expect(screen.getByText('of 68 oz')).toBeInTheDocument();
    expect(screen.getByText('16 oz')).toBeInTheDocument();
    expect(screen.getByText(/not medical advice/)).toBeInTheDocument();
  });

  it('shows a friendly empty day', () => {
    renderAt('/meals');
    expect(screen.getByText('No meals planned')).toBeInTheDocument();
  });
});
