import { describe, expect, it } from 'vitest';
import {
  buildItemPayload,
  groupPlans,
  groupRuns,
  groupSummary,
  itemTargetLabel,
  nextSortOrder,
  reorderChanges,
  validateItem,
  type ItemValues,
} from './helpers';

const base: ItemValues = {
  target_sets: 3,
  rep_mode: 'reps',
  rep_min: 8,
  rep_max: 12,
  duration_seconds_min: null,
  rest_seconds: null,
  group_name: '',
  tempo: '',
  notes: '',
  alternative_exercise_ids: [],
};

describe('buildItemPayload', () => {
  it('keeps rep ranges for reps mode and trims text', () => {
    expect(
      buildItemPayload({ ...base, group_name: ' Back ', tempo: '2-1-2-0', notes: '  Squeeze ' }),
    ).toEqual({
      target_sets: 3,
      rep_mode: 'reps',
      rep_min: 8,
      rep_max: 12,
      duration_seconds_min: null,
      rest_seconds: null,
      group_name: 'Back',
      tempo: '2-1-2-0',
      notes: 'Squeeze',
      alternative_exercise_ids: [],
    });
  });

  it('writes 1/1 placeholders for AMRAP and timed', () => {
    const amrap = buildItemPayload({ ...base, rep_mode: 'amrap', duration_seconds_min: 30 });
    expect([amrap.rep_min, amrap.rep_max, amrap.duration_seconds_min]).toEqual([1, 1, null]);
    const timed = buildItemPayload({ ...base, rep_mode: 'timed', duration_seconds_min: 45 });
    expect([timed.rep_min, timed.rep_max, timed.duration_seconds_min]).toEqual([1, 1, 45]);
  });

  it('dedupes alternatives', () => {
    expect(
      buildItemPayload({ ...base, alternative_exercise_ids: ['a', 'b', 'a'] }).alternative_exercise_ids,
    ).toEqual(['a', 'b']);
  });
});

describe('validateItem', () => {
  it('requires seconds for timed items and a valid range for reps', () => {
    expect(validateItem(base)).toEqual({});
    expect(validateItem({ ...base, rep_mode: 'timed' }).duration_seconds_min).toBeDefined();
    expect(validateItem({ ...base, rep_min: 12, rep_max: 8 }).rep_max).toBeDefined();
    expect(validateItem({ ...base, rep_mode: 'amrap', rep_min: null, rep_max: null })).toEqual({});
    expect(validateItem({ ...base, target_sets: 0 }).target_sets).toBeDefined();
    expect(validateItem({ ...base, rest_seconds: 1000 }).rest_seconds).toBeDefined();
  });
});

describe('reorderChanges', () => {
  const items = [
    { id: 'a', sort_order: 0 },
    { id: 'b', sort_order: 1 },
    { id: 'c', sort_order: 2 },
  ];
  it('only writes rows whose position changed', () => {
    expect(reorderChanges(items, 2, 1)).toEqual([
      { id: 'c', sort_order: 1 },
      { id: 'b', sort_order: 2 },
    ]);
    expect(reorderChanges(items, 0, 0)).toEqual([]);
    expect(reorderChanges(items, 0, 3)).toEqual([]);
  });
  it('repairs duplicate or sparse sort orders', () => {
    const messy = [
      { id: 'a', sort_order: 0 },
      { id: 'b', sort_order: 0 },
      { id: 'c', sort_order: 5 },
    ];
    expect(reorderChanges(messy, 0, 1)).toEqual([
      { id: 'a', sort_order: 1 },
      { id: 'c', sort_order: 2 },
    ]);
    expect(nextSortOrder(messy)).toBe(6);
    expect(nextSortOrder([])).toBe(0);
  });
});

describe('grouping', () => {
  it('groups consecutive items and summarizes groups', () => {
    const items = [
      { group_name: 'Back' },
      { group_name: 'Back' },
      { group_name: null },
      { group_name: 'Biceps' },
    ];
    const runs = groupRuns(items);
    expect(runs.map((r) => [r.group, r.items.map((i) => i.index)])).toEqual([
      ['Back', [0, 1]],
      [null, [2]],
      ['Biceps', [3]],
    ]);
    expect(groupSummary({ items: items as never })).toBe('Back · Biceps');
  });

  it('groups shared plans by plan name', () => {
    const plans = groupPlans([
      { plan_name: 'PPL' },
      { plan_name: 'Upper/Lower' },
      { plan_name: 'PPL' },
      { plan_name: null },
    ]);
    expect(plans.map((p) => [p.name, p.templates.length])).toEqual([
      ['PPL', 2],
      ['Upper/Lower', 1],
      ['Other', 1],
    ]);
  });
});

describe('itemTargetLabel', () => {
  it('labels each rep mode', () => {
    const item = { target_sets: 3, rep_mode: 'reps', rep_min: 10, rep_max: 10, duration_seconds_min: null };
    expect(itemTargetLabel(item)).toBe('3 × 10');
    expect(itemTargetLabel({ ...item, rep_min: 8, rep_max: 12 })).toBe('3 × 8–12');
    expect(itemTargetLabel({ ...item, target_sets: 2, rep_mode: 'amrap', rep_min: 1, rep_max: 1 })).toBe(
      '2 sets AMRAP',
    );
    expect(itemTargetLabel({ ...item, target_sets: 5, rep_mode: 'timed', duration_seconds_min: 30 })).toBe(
      '5 rounds × 30s+',
    );
  });
});
