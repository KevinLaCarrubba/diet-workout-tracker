import { describe, expect, it } from 'vitest';
import {
  buildReschedule,
  formatWeekLabel,
  normalizeTime,
  planRuleChange,
  ruleChoice,
  weekRange,
  type Rule,
} from './week';

describe('weekRange', () => {
  it('starts on Monday of the ISO week', () => {
    // 2026-10-18 is a Sunday
    const w = weekRange('2026-10-18');
    expect(w.from).toBe('2026-10-12');
    expect(w.to).toBe('2026-10-18');
    expect(w.days.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(w.days[0]!.label).toBe('Mon');
  });

  it('handles Mondays and week offsets across months', () => {
    expect(weekRange('2026-10-12').from).toBe('2026-10-12');
    const prev = weekRange('2026-10-07', -1);
    expect(prev.from).toBe('2026-09-28');
    expect(prev.to).toBe('2026-10-04');
    expect(weekRange('2026-10-18', 1).from).toBe('2026-10-19');
  });

  it('formats the week label', () => {
    expect(formatWeekLabel('2026-10-12', '2026-10-18')).toBe('Oct 12 – 18');
    expect(formatWeekLabel('2026-09-28', '2026-10-04')).toBe('Sep 28 – Oct 4');
  });
});

describe('normalizeTime', () => {
  it('normalizes to HH:mm:ss', () => {
    expect(normalizeTime('5:00')).toBe('05:00:00');
    expect(normalizeTime('18:30:00')).toBe('18:30:00');
    expect(normalizeTime('')).toBeNull();
    expect(normalizeTime('25:00')).toBeNull();
    expect(normalizeTime(null)).toBeNull();
  });
});

describe('buildReschedule', () => {
  const original = { id: 'orig', user_id: 'u1', template_id: 't1', notes: null };

  it('marks the original rescheduled and inserts a one-off occurrence', () => {
    const r = buildReschedule(original, { date: '2026-10-20', time: '18:00' }, 'America/New_York', 'new');
    expect(r.update).toEqual({ status: 'rescheduled' });
    expect(r.insert).toEqual({
      id: 'new',
      user_id: 'u1',
      schedule_id: null,
      template_id: 't1',
      local_date: '2026-10-20',
      local_time: '18:00:00',
      scheduled_at: '2026-10-20T22:00:00.000Z',
      is_rest: false,
      status: 'scheduled',
      rescheduled_from: 'orig',
      notes: null,
    });
  });

  it('allows "any time" (no time)', () => {
    const r = buildReschedule(original, { date: '2026-10-20', time: null }, 'UTC', 'new');
    expect(r.insert.local_time).toBeNull();
    expect(r.insert.scheduled_at).toBeNull();
  });
});

describe('planRuleChange', () => {
  const rule: Rule = { id: 'r1', weekday: 1, template_id: 't1', local_time: '05:00:00', active: true };

  it('inserts when nothing is planned', () => {
    expect(planRuleChange(2, undefined, 't2', '06:00')).toEqual({
      type: 'insert',
      values: { weekday: 2, template_id: 't2', local_time: '06:00:00' },
    });
    expect(planRuleChange(2, undefined, 'rest', '06:00')).toEqual({
      type: 'insert',
      values: { weekday: 2, template_id: null, local_time: null },
    });
    expect(planRuleChange(2, undefined, 'none', null)).toEqual({ type: 'noop' });
  });

  it('updates an active rule and skips no-op changes', () => {
    expect(planRuleChange(1, rule, 't1', '05:00')).toEqual({ type: 'noop' });
    expect(planRuleChange(1, rule, 't1', '06:15')).toEqual({
      type: 'update',
      id: 'r1',
      patch: { template_id: 't1', local_time: '06:15:00' },
    });
    expect(planRuleChange(1, rule, 'rest', '05:00')).toEqual({
      type: 'update',
      id: 'r1',
      patch: { template_id: null, local_time: null },
    });
  });

  it('deactivates to clear a day', () => {
    expect(planRuleChange(1, rule, 'none', null)).toEqual({ type: 'deactivate', id: 'r1' });
  });

  it('maps rules to choices', () => {
    expect(ruleChoice(undefined)).toBe('none');
    expect(ruleChoice({ ...rule, template_id: null })).toBe('rest');
    expect(ruleChoice(rule)).toBe('t1');
  });
});
