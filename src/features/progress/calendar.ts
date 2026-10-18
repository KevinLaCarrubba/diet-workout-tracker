import { dayjs } from '@/lib/time';
import type { Enums } from '@/types/database';

/** Monday (YYYY-MM-DD) of the ISO week containing `date`. */
export function isoWeekStart(date: string): string {
  const d = dayjs.utc(date);
  const offset = (d.day() + 6) % 7; // Mon → 0 … Sun → 6
  return d.subtract(offset, 'day').format('YYYY-MM-DD');
}

export const addDays = (date: string, days: number) => dayjs.utc(date).add(days, 'day').format('YYYY-MM-DD');

/** The last `count` ISO week starts ending with the week containing `today`, oldest first. */
export function recentWeekStarts(today: string, count: number): string[] {
  const current = isoWeekStart(today);
  return Array.from({ length: count }, (_, i) => addDays(current, -7 * (count - 1 - i)));
}

/**
 * Month grid for `month` (YYYY-MM), Monday-first, padded with nulls so every
 * row has seven cells.
 */
export function monthGrid(month: string): (string | null)[][] {
  const first = dayjs.utc(`${month}-01`);
  const daysInMonth = first.daysInMonth();
  const lead = (first.day() + 6) % 7;
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let i = 0; i < daysInMonth; i++) cells.push(first.add(i, 'day').format('YYYY-MM-DD'));
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

export type DayState = 'completed' | 'skipped' | 'rescheduled' | 'rest' | 'upcoming' | 'not-logged' | 'none';

export interface ScheduledLike {
  status: Enums<'scheduled_workout_status'>;
  is_rest: boolean;
}

/**
 * What a calendar day shows. A completed session wins; otherwise a still-open
 * planned workout (upcoming, or "not logged" once the day has passed); then
 * skipped; then a workout moved to another day; then rest.
 */
export function dayState(
  date: string,
  today: string,
  scheduled: ScheduledLike[],
  completedSessions: number,
): DayState {
  if (completedSessions > 0 || scheduled.some((s) => s.status === 'completed')) return 'completed';
  const open = scheduled.filter((s) => !s.is_rest && s.status === 'scheduled');
  if (open.length > 0) return date < today ? 'not-logged' : 'upcoming';
  if (scheduled.some((s) => s.status === 'skipped')) return 'skipped';
  if (scheduled.some((s) => s.status === 'rescheduled')) return 'rescheduled';
  if (scheduled.some((s) => s.is_rest || s.status === 'rest')) return 'rest';
  return 'none';
}

/** Sums `value` per ISO week for the given week starts (missing weeks → 0). */
export function sumByWeek<T>(
  items: T[],
  weekStarts: string[],
  dateOf: (item: T) => string,
  value: (item: T) => number,
): number[] {
  const index = new Map(weekStarts.map((w, i) => [w, i]));
  const totals = weekStarts.map(() => 0);
  for (const item of items) {
    const i = index.get(isoWeekStart(dateOf(item)));
    if (i !== undefined) totals[i]! += value(item);
  }
  return totals;
}
