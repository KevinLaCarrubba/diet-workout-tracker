import { describe, expect, it } from 'vitest';
import {
  entriesOnDate,
  fillDailyTotals,
  goalPercent,
  isValidAmount,
  localDayBounds,
  mergeWaterEntries,
  pendingWaterOps,
  quickAddPresets,
  totalMl,
  withDayTotal,
  type WaterEntry,
} from './water';

const TZ = 'America/New_York';
const entry = (id: string, amount_ml: number, occurred_at: string): WaterEntry => ({
  id,
  user_id: 'u1',
  amount_ml,
  occurred_at,
});

describe('quickAddPresets', () => {
  it('uses ounces for imperial and millilitres for metric', () => {
    expect(quickAddPresets('imperial')).toEqual([
      { label: '8 oz', ml: 237 },
      { label: '12 oz', ml: 355 },
      { label: '16 oz', ml: 473 },
      { label: '24 oz', ml: 710 },
    ]);
    expect(quickAddPresets('metric').map((p) => p.ml)).toEqual([250, 350, 500, 700]);
  });
});

describe('outbox merge', () => {
  const server = [
    entry('a', 250, '2026-10-18T13:00:00Z'),
    entry('b', 500, '2026-10-18T15:00:00Z'),
    entry('c', 300, '2026-10-18T16:00:00Z'),
  ];

  it('reads pending ops for the user only', () => {
    const ops = pendingWaterOps(
      [
        { kind: 'water_log', user_id: 'u1', updated_at: 2, payload: entry('d', 100, '2026-10-18T17:00:00Z') },
        { kind: 'water_log', user_id: 'u1', updated_at: 1, payload: entry('b', 700, '2026-10-18T15:00:00Z') },
        { kind: 'delete_water_log', user_id: 'u1', updated_at: 3, payload: { id: 'c' } },
        { kind: 'water_log', user_id: 'u2', updated_at: 4, payload: entry('x', 100, '2026-10-18T17:00:00Z') },
        { kind: 'cardio_session', user_id: 'u1', updated_at: 5, payload: { id: 'y' } },
      ],
      'u1',
    );
    expect(ops.upserts.map((u) => u.id)).toEqual(['b', 'd']);
    expect(ops.upserts.every((u) => u.pending)).toBe(true);
    expect(ops.deletes).toEqual(['c']);
  });

  it('overlays unsynced adds, edits and deletions, newest first', () => {
    const merged = mergeWaterEntries(server, {
      upserts: [
        { ...entry('b', 700, '2026-10-18T15:00:00Z'), pending: true },
        { ...entry('d', 100, '2026-10-18T17:00:00Z'), pending: true },
      ],
      deletes: ['c'],
    });
    expect(merged.map((e) => [e.id, e.amount_ml])).toEqual([
      ['d', 100],
      ['b', 700],
      ['a', 250],
    ]);
  });
});

describe('days and totals', () => {
  it('filters entries by local day', () => {
    const rows = [entry('late', 250, '2026-10-19T03:30:00Z'), entry('next', 250, '2026-10-19T04:30:00Z')];
    expect(entriesOnDate(rows, '2026-10-18', TZ).map((e) => e.id)).toEqual(['late']);
  });

  it('computes local day bounds in UTC', () => {
    expect(localDayBounds('2026-10-18', TZ)).toEqual({
      from: '2026-10-18T04:00:00.000Z',
      to: '2026-10-19T04:00:00.000Z',
    });
  });

  it('totals and caps progress', () => {
    expect(totalMl([{ amount_ml: 250 }, { amount_ml: 500 }])).toBe(750);
    expect(goalPercent(750, 2000)).toBe(38);
    expect(goalPercent(2500, 2000)).toBe(100);
    expect(goalPercent(500, null)).toBe(0);
  });

  it('validates amounts', () => {
    expect(isValidAmount(250)).toBe(true);
    expect(isValidAmount(0)).toBe(false);
    expect(isValidAmount(6000)).toBe(false);
    expect(isValidAmount(Number.NaN)).toBe(false);
  });

  it('zero-fills history and swaps in today', () => {
    const filled = fillDailyTotals(
      [{ local_date: '2026-10-17', total_ml: 1000 }],
      '2026-10-16',
      '2026-10-18',
    );
    expect(filled).toEqual([
      { local_date: '2026-10-16', total_ml: 0 },
      { local_date: '2026-10-17', total_ml: 1000 },
      { local_date: '2026-10-18', total_ml: 0 },
    ]);
    expect(withDayTotal(filled, '2026-10-18', 473)[2]).toEqual({ local_date: '2026-10-18', total_ml: 473 });
  });
});
