import { describe, expect, it } from 'vitest';
import { buildChecklist } from './checklist';

const base = {
  workout: null,
  workoutDoneToday: false,
  meals: [],
  waterMl: 0,
  waterGoalMl: 2000,
  weighedIn: false,
};

describe('daily checklist', () => {
  it('treats rest days as done and never as missed', () => {
    const items = buildChecklist({ ...base, isRestDay: true });
    expect(items.find((i) => i.key === 'workout')).toMatchObject({ label: 'Rest day', done: true });
  });

  it('counts skipped meals as handled but reports eaten count', () => {
    const items = buildChecklist({
      ...base,
      isRestDay: false,
      meals: [{ status: 'eaten' }, { status: 'skipped' }, { status: 'rescheduled' }],
    });
    expect(items.find((i) => i.key === 'meals')).toMatchObject({ detail: '1 of 2 eaten', done: true });
  });

  it('marks the workout done when completed or explicitly skipped/moved', () => {
    expect(buildChecklist({ ...base, isRestDay: false, workout: { status: 'scheduled' } })[1]!.done).toBe(
      false,
    );
    expect(buildChecklist({ ...base, isRestDay: false, workout: { status: 'skipped' } })[1]).toMatchObject({
      detail: 'Skipped',
      done: true,
    });
    expect(
      buildChecklist({
        ...base,
        isRestDay: false,
        workout: { status: 'scheduled' },
        workoutDoneToday: true,
      })[1]!.done,
    ).toBe(true);
  });

  it('caps the water percentage at 100', () => {
    const water = buildChecklist({ ...base, isRestDay: false, waterMl: 3000 }).find((i) => i.key === 'water');
    expect(water).toMatchObject({ detail: '100%', done: true });
  });
});
