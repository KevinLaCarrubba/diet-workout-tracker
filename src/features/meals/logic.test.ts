import { describe, expect, it } from 'vitest';
import {
  adHocMealPayload,
  dayTitle,
  displayOrderFor,
  duplicateSchedule,
  eatenPatch,
  effectiveDueAt,
  mealState,
  movedToLabel,
  nextQuarterHour,
  nextUpcomingMeal,
  parseItems,
  reschedulePayload,
  resolveSection,
  scheduleFromForm,
  scheduleToForm,
  serializeItems,
  skipPatch,
  snoozePatch,
  stateLabel,
  undoPatch,
  weekdaysLabel,
  type MealOccurrence,
  type MealSchedule,
} from './logic';

const TZ = 'America/New_York';

function occ(over: Partial<MealOccurrence> = {}): MealOccurrence {
  return {
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
    created_at: '2026-10-18T00:00:00Z',
    updated_at: '2026-10-18T00:00:00Z',
    meal_number: 2,
    display_order: 3,
    items_snapshot: [{ text: '6 oz beef' }],
    coach_note_snapshot: 'No rice required.',
    snoozed_until: null,
    ...over,
  };
}

describe('items', () => {
  it('parses coach items defensively', () => {
    expect(
      parseItems([{ text: ' 6 oz beef ' }, { text: 'asparagus', optional: true }, 'plain', 3, { foo: 1 }]),
    ).toEqual([{ text: '6 oz beef' }, { text: 'asparagus', optional: true }, { text: 'plain' }]);
    expect(parseItems(null)).toEqual([]);
    expect(parseItems({ text: 'x' })).toEqual([]);
  });

  it('serializes editor rows, dropping blanks', () => {
    expect(
      serializeItems([
        { text: 'a', optional: false },
        { text: '  ', optional: true },
        { text: 'b ', optional: true },
      ]),
    ).toEqual([{ text: 'a' }, { text: 'b', optional: true }]);
  });
});

describe('state', () => {
  const now = new Date('2026-10-18T13:10:00Z'); // 9:10 AM New York

  it('reports snoozed only while the snooze is in the future', () => {
    expect(mealState(occ({ snoozed_until: '2026-10-18T13:30:00Z' }), now)).toBe('snoozed');
    expect(mealState(occ({ snoozed_until: '2026-10-18T13:00:00Z' }), now)).toBe('pending');
    expect(mealState(occ({ status: 'eaten' }), now)).toBe('eaten');
  });

  it('labels states in the user timezone', () => {
    expect(stateLabel(occ({ status: 'eaten', completed_at: '2026-10-18T13:12:00Z' }), TZ, now)).toBe(
      'Eaten at 9:12 AM',
    );
    expect(stateLabel(occ({ snoozed_until: '2026-10-18T13:40:00Z' }), TZ, now)).toBe('Snoozed until 9:40 AM');
    expect(stateLabel(occ({ status: 'skipped' }), TZ, now)).toBe('Skipped');
    expect(stateLabel(occ(), TZ, now)).toBe('Pending');
  });

  it('uses the snooze end as the due time', () => {
    expect(effectiveDueAt(occ({ snoozed_until: '2026-10-18T13:30:00Z' }))).toBe('2026-10-18T13:30:00Z');
    expect(effectiveDueAt(occ())).toBe('2026-10-18T13:00:00.000Z');
  });
});

describe('nextUpcomingMeal', () => {
  const meals = [
    occ({ id: 'm1', scheduled_at: '2026-10-18T08:35:00Z' }), // 4:35 AM
    occ({
      id: 'm4',
      scheduled_at: '2026-10-18T10:30:00Z',
      status: 'eaten',
      completed_at: '2026-10-18T10:31:00Z',
    }),
    occ({ id: 'm2', scheduled_at: '2026-10-18T13:00:00Z' }), // 9:00 AM
    occ({ id: 'm3', scheduled_at: '2026-10-18T16:30:00Z' }), // 12:30 PM
  ];

  it('picks the earliest pending meal that is due soon or recently', () => {
    expect(nextUpcomingMeal(meals, new Date('2026-10-18T13:30:00Z'))?.id).toBe('m2');
    expect(nextUpcomingMeal(meals, new Date('2026-10-18T14:30:00Z'))?.id).toBe('m3');
  });

  it("doesn't dwell on long-overdue meals", () => {
    expect(nextUpcomingMeal(meals, new Date('2026-10-18T12:00:00Z'))?.id).toBe('m2');
  });

  it('follows snoozes and returns null when nothing is left', () => {
    const snoozed = meals.map((m) => (m.id === 'm2' ? { ...m, snoozed_until: '2026-10-18T17:00:00Z' } : m));
    expect(nextUpcomingMeal(snoozed, new Date('2026-10-18T13:30:00Z'))?.id).toBe('m3');
    expect(nextUpcomingMeal(meals, new Date('2026-10-18T23:00:00Z'))).toBeNull();
  });
});

describe('patches', () => {
  const now = new Date('2026-10-18T13:12:00Z');
  it('builds eaten / skip / undo / snooze patches', () => {
    expect(eatenPatch(now)).toEqual({
      status: 'eaten',
      completed_at: now.toISOString(),
      snoozed_until: null,
    });
    expect(skipPatch()).toEqual({ status: 'skipped', completed_at: null, snoozed_until: null });
    expect(undoPatch()).toEqual({ status: 'pending', completed_at: null, snoozed_until: null });
    expect(snoozePatch(30, now)).toEqual({ status: 'pending', snoozed_until: '2026-10-18T13:42:00.000Z' });
  });
});

describe('reschedule and ad hoc', () => {
  it('copies the meal into a new unscheduled occurrence and marks the original moved', () => {
    const original = occ({ notes: 'note' });
    const { insert, originalPatch } = reschedulePayload(original, {
      id: 'new',
      userId: 'u1',
      date: '2026-10-19',
      time: '15:00',
      timezone: TZ,
      displayOrder: 5,
    });
    expect(insert).toMatchObject({
      id: 'new',
      schedule_id: null,
      rescheduled_from: 'o1',
      local_date: '2026-10-19',
      local_time: '15:00:00',
      scheduled_at: '2026-10-19T19:00:00.000Z',
      label_snapshot: 'Meal 2',
      items_snapshot: [{ text: '6 oz beef' }],
      coach_note_snapshot: 'No rice required.',
      meal_number: 2,
      display_order: 5,
      status: 'pending',
    });
    expect(originalPatch).toEqual({ status: 'rescheduled', completed_at: null, snoozed_until: null });
  });

  it('places a meal chronologically by display order', () => {
    const day = [
      { display_order: 1, local_time: '04:35:00' },
      { display_order: 3, local_time: '09:00:00' },
      { display_order: 4, local_time: '12:30:00' },
    ];
    expect(displayOrderFor(day, '10:00')).toBe(3);
    expect(displayOrderFor(day, '04:00')).toBe(1);
    expect(displayOrderFor(day, '23:00')).toBe(4);
    expect(displayOrderFor([], '10:00')).toBe(0);
  });

  it('builds an ad hoc meal', () => {
    expect(
      adHocMealPayload({
        id: 'a',
        userId: 'u1',
        label: ' Snack ',
        description: ' ',
        date: '2026-10-18',
        time: '9:5',
        timezone: TZ,
        displayOrder: 2,
      }),
    ).toMatchObject({
      label_snapshot: 'Snack',
      description_snapshot: null,
      local_time: '09:05:00',
      scheduled_at: '2026-10-18T13:05:00.000Z',
      schedule_id: null,
    });
  });

  it('describes where a moved meal went', () => {
    const original = occ({ status: 'rescheduled' });
    const same = occ({ id: 'n', rescheduled_from: 'o1', local_time: '15:00:00' });
    const other = { ...same, local_date: '2026-10-20' };
    expect(movedToLabel(original, [original, same], '2026-10-18')).toBe('moved to 3:00 PM');
    expect(movedToLabel(original, [original, other], '2026-10-18')).toBe('moved to Tue, Oct 20 3:00 PM');
    expect(movedToLabel(original, [original], '2026-10-18')).toBe('moved');
  });
});

describe('weekly plan', () => {
  it('summarises weekdays', () => {
    expect(weekdaysLabel([1, 2, 3, 4, 5, 6, 7])).toBe('Every day');
    expect(weekdaysLabel([1, 2, 3, 5, 6, 7])).toBe('Every day except Thu');
    expect(weekdaysLabel([5, 1, 2, 3, 4])).toBe('Weekdays');
    expect(weekdaysLabel([1, 3])).toBe('Mon, Wed');
  });

  const schedule: MealSchedule = {
    id: 's1',
    user_id: 'u1',
    label: 'Meal 3',
    description: 'Pre-workout meal',
    notes: null,
    local_time: '12:30:00',
    recurrence_weekdays: [1, 2, 3, 4, 5, 6, 7],
    active: true,
    created_at: '',
    updated_at: '',
    meal_number: 3,
    display_order: 4,
    items: [{ text: '5.5 oz jasmine rice' }, { text: 'asparagus', optional: true }],
    coach_note: '60–90 minutes before training',
    relative_event: null,
    relative_offset_minutes: null,
    needs_confirmation: true,
    confirmation_note: 'Conflicts with 5 AM gym',
    import_key: 'coach:meal-3',
  };

  it('round-trips the editor form', () => {
    let n = 0;
    const form = scheduleToForm(schedule, () => `k${n++}`);
    expect(form.local_time).toBe('12:30');
    expect(form.recurrence_weekdays).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(scheduleFromForm(form)).toEqual({
      label: 'Meal 3',
      meal_number: 3,
      description: 'Pre-workout meal',
      items: [{ text: '5.5 oz jasmine rice' }, { text: 'asparagus', optional: true }],
      coach_note: '60–90 minutes before training',
      notes: null,
      local_time: '12:30:00',
      recurrence_weekdays: [1, 2, 3, 4, 5, 6, 7],
      active: true,
      display_order: 4,
      needs_confirmation: true,
      confirmation_note: 'Conflicts with 5 AM gym',
    });
    expect(scheduleFromForm({ ...form, needs_confirmation: false }).confirmation_note).toBeNull();
  });

  it('duplicates without the import key', () => {
    const copy = duplicateSchedule(schedule, 'new', 'u1');
    expect(copy.label).toBe('Meal 3 (copy)');
    expect(copy).not.toHaveProperty('import_key');
    expect(copy.id).toBe('new');
    expect(duplicateSchedule({ ...schedule, label: 'x'.repeat(40) }, 'n', 'u1').label).toHaveLength(40);
  });
});

describe('misc', () => {
  it('rounds to the next quarter hour in the timezone', () => {
    expect(nextQuarterHour(TZ, new Date('2026-10-18T13:07:00Z'))).toBe('09:15');
    expect(nextQuarterHour(TZ, new Date('2026-10-18T13:15:00Z'))).toBe('09:30');
    expect(nextQuarterHour(TZ, new Date('2026-10-19T03:55:00Z'))).toBe('23:45');
  });

  it('resolves the page section', () => {
    expect(resolveSection(undefined, null)).toBe('today');
    expect(resolveSection('plan', null)).toBe('plan');
    expect(resolveSection('nope', null)).toBe('today');
    expect(resolveSection(undefined, 'water')).toBe('water');
  });

  it('titles days relative to today', () => {
    expect(dayTitle('2026-10-18', '2026-10-18')).toBe('Today');
    expect(dayTitle('2026-10-19', '2026-10-18')).toBe('Tomorrow');
    expect(dayTitle('2026-10-17', '2026-10-18')).toBe('Yesterday');
    expect(dayTitle('2026-10-21', '2026-10-18')).toBe('Wed, Oct 21');
  });
});
