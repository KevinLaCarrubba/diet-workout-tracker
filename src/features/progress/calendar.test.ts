import { describe, expect, it } from 'vitest';
import { dayState, isoWeekStart, monthGrid, recentWeekStarts, sumByWeek } from './calendar';

describe('isoWeekStart', () => {
  it('returns the Monday of the week', () => {
    expect(isoWeekStart('2026-10-18')).toBe('2026-10-12'); // Sunday
    expect(isoWeekStart('2026-10-12')).toBe('2026-10-12'); // Monday
    expect(isoWeekStart('2026-10-14')).toBe('2026-10-12');
    expect(isoWeekStart('2027-01-01')).toBe('2026-12-28'); // across a year
  });

  it('lists recent weeks oldest first', () => {
    expect(recentWeekStarts('2026-10-18', 3)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12']);
  });
});

describe('monthGrid', () => {
  it('pads to Monday-first weeks', () => {
    const grid = monthGrid('2026-10'); // Oct 1 2026 is a Thursday
    expect(grid[0]).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(grid.every((row) => row.length === 7)).toBe(true);
    expect(grid.flat().filter(Boolean)).toHaveLength(31);
    expect(grid.at(-1)).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      null,
    ]);
  });

  it('handles February in a leap year', () => {
    expect(monthGrid('2028-02').flat().filter(Boolean)).toHaveLength(29);
  });
});

describe('dayState', () => {
  const today = '2026-10-18';
  const s = (status: 'scheduled' | 'completed' | 'skipped' | 'rescheduled' | 'rest', is_rest = false) => ({
    status,
    is_rest,
  });

  it('marks completed from a session or the scheduled status', () => {
    expect(dayState('2026-10-10', today, [s('scheduled')], 1)).toBe('completed');
    expect(dayState('2026-10-10', today, [s('completed')], 0)).toBe('completed');
    expect(dayState('2026-10-10', today, [s('rest', true)], 1)).toBe('completed'); // extra workout on a rest day
  });

  it('distinguishes upcoming from past-not-logged', () => {
    expect(dayState('2026-10-18', today, [s('scheduled')], 0)).toBe('upcoming');
    expect(dayState('2026-10-25', today, [s('scheduled')], 0)).toBe('upcoming');
    expect(dayState('2026-10-17', today, [s('scheduled')], 0)).toBe('not-logged');
  });

  it('distinguishes skipped, rescheduled and rest', () => {
    expect(dayState('2026-10-10', today, [s('skipped')], 0)).toBe('skipped');
    expect(dayState('2026-10-10', today, [s('rescheduled')], 0)).toBe('rescheduled');
    expect(dayState('2026-10-10', today, [s('rest', true)], 0)).toBe('rest');
    expect(dayState('2026-10-10', today, [], 0)).toBe('none');
  });

  it('shows the workout moved onto a day rather than the one moved away', () => {
    expect(dayState('2026-10-20', today, [s('rescheduled'), s('scheduled')], 0)).toBe('upcoming');
    expect(dayState('2026-10-10', today, [s('rest', true), s('skipped')], 0)).toBe('skipped');
  });
});

describe('sumByWeek', () => {
  it('buckets by ISO week and ignores other weeks', () => {
    const weeks = ['2026-10-05', '2026-10-12'];
    const items = [
      { d: '2026-10-05', v: 10 },
      { d: '2026-10-11', v: 5 }, // Sunday → week of Oct 5
      { d: '2026-10-12', v: 30 },
      { d: '2026-09-30', v: 99 },
    ];
    expect(
      sumByWeek(
        items,
        weeks,
        (i) => i.d,
        (i) => i.v,
      ),
    ).toEqual([15, 30]);
  });
});
