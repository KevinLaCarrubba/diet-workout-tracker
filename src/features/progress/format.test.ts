import { describe, expect, it } from 'vitest';
import { formatDateRange, formatSigned, formatWeightDelta, fromLocalInput, toLocalInput } from './format';

describe('formatSigned', () => {
  it('signs values with a typographic minus', () => {
    expect(formatSigned(1.25)).toBe('+1.3');
    expect(formatSigned(-2)).toBe('−2');
    expect(formatSigned(-0.04)).toBe('0');
  });
});

describe('formatWeightDelta', () => {
  it('converts kg differences to the user units', () => {
    expect(formatWeightDelta(-2, 'imperial')).toBe('−4.4 lb');
    expect(formatWeightDelta(1.5, 'metric')).toBe('+1.5 kg');
  });
});

describe('formatDateRange', () => {
  it('omits the year inside the current year', () => {
    expect(formatDateRange('2026-11-03', '2026-12-20', '2026-10-18')).toBe('Nov 3 – Dec 20');
  });
  it('adds years when the range leaves the current year', () => {
    expect(formatDateRange('2026-12-03', '2027-02-20', '2026-10-18')).toBe('Dec 3, 2026 – Feb 20, 2027');
  });
  it('shows an open end', () => {
    expect(formatDateRange('2026-12-03', null, '2026-10-18')).toBe('Dec 3 or later');
  });
});

describe('datetime-local round trip', () => {
  it('interprets the input in the user timezone', () => {
    expect(toLocalInput('2026-10-18T12:30:00Z', 'America/New_York')).toBe('2026-10-18T08:30');
    expect(fromLocalInput('2026-10-18T08:30', 'America/New_York')).toBe('2026-10-18T12:30:00.000Z');
  });
});
