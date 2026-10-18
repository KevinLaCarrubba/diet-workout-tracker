import { describe, expect, it } from 'vitest';
import { formatDuration, formatLocalTime, isoWeekday, isValidTimezone, localDate, zonedToUtc } from './time';

describe('time helpers', () => {
  it('formats 24h local times for display', () => {
    expect(formatLocalTime('13:30:00')).toBe('1:30 PM');
    expect(formatLocalTime('00:05')).toBe('12:05 AM');
    expect(formatLocalTime('12:00')).toBe('12:00 PM');
  });

  it('converts a local wall-clock time in a timezone to UTC', () => {
    expect(zonedToUtc('2026-07-01', '13:30', 'America/New_York')).toBe('2026-07-01T17:30:00.000Z');
    expect(zonedToUtc('2026-01-15', '13:30', 'America/New_York')).toBe('2026-01-15T18:30:00.000Z');
  });

  it("computes the local calendar date in the user's timezone", () => {
    expect(localDate('America/Los_Angeles', '2026-10-18T03:00:00Z')).toBe('2026-10-17');
    expect(localDate('Europe/Berlin', '2026-10-18T23:30:00Z')).toBe('2026-10-19');
  });

  it('uses ISO weekdays (Monday = 1, Sunday = 7)', () => {
    expect(isoWeekday('2026-10-19')).toBe(1);
    expect(isoWeekday('2026-10-18')).toBe(7);
  });

  it('validates IANA timezones and formats durations', () => {
    expect(isValidTimezone('America/Chicago')).toBe(true);
    expect(isValidTimezone('Mars/Olympus')).toBe(false);
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3725)).toBe('1:02:05');
  });
});
