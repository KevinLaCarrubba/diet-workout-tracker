import { describe, expect, it } from 'vitest';
import {
  inQuietHours,
  isDueNow,
  localClock,
  waterBehind,
  weekStart,
} from '../../supabase/functions/send-reminders/schedule.ts';

describe('reminder scheduling helpers (send-reminders)', () => {
  it('reads the local wall clock in the user timezone', () => {
    const c = localClock(new Date('2026-10-18T17:35:00Z'), 'America/Chicago');
    expect(c).toEqual({ date: '2026-10-18', minutes: 12 * 60 + 35, isoWeekday: 7 });
  });

  it('handles quiet hours that wrap past midnight', () => {
    expect(inQuietHours(23 * 60, '22:00', '07:00')).toBe(true);
    expect(inQuietHours(6 * 60 + 59, '22:00', '07:00')).toBe(true);
    expect(inQuietHours(7 * 60, '22:00', '07:00')).toBe(false);
    expect(inQuietHours(13 * 60, '12:00', '14:00')).toBe(true);
  });

  it('considers a time due only within the run window', () => {
    expect(isDueNow(7 * 60 + 32, '07:30:00')).toBe(true);
    expect(isDueNow(7 * 60 + 29, '07:30')).toBe(false);
    expect(isDueNow(7 * 60 + 45, '07:30')).toBe(false);
  });

  it('finds the ISO week start', () => {
    expect(weekStart('2026-10-18')).toBe('2026-10-12');
    expect(weekStart('2026-10-12')).toBe('2026-10-12');
  });

  it('only nudges water when well behind pace', () => {
    expect(waterBehind(0, 2000, 7 * 60)).toBe(false);
    expect(waterBehind(400, 2000, 14 * 60)).toBe(true); // expected 1000, 75% = 750
    expect(waterBehind(900, 2000, 14 * 60)).toBe(false);
  });
});
