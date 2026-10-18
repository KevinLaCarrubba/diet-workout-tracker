import { dayjs, isoWeekday, zonedToUtc } from '@/lib/time';
import type { Tables, TablesInsert } from '@/types/database';

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export interface WeekDay {
  date: string;
  /** ISO weekday 1 (Mon) … 7 (Sun) */
  weekday: number;
  label: string;
}

/** Monday–Sunday of the ISO week containing `today`, shifted by `offset` weeks. */
export function weekRange(today: string, offset = 0): { from: string; to: string; days: WeekDay[] } {
  const monday = dayjs(today)
    .subtract(isoWeekday(today) - 1, 'day')
    .add(offset * 7, 'day');
  const days = Array.from({ length: 7 }, (_, i) => ({
    date: monday.add(i, 'day').format('YYYY-MM-DD'),
    weekday: i + 1,
    label: WEEKDAY_LABELS[i]!,
  }));
  return { from: days[0]!.date, to: days[6]!.date, days };
}

/** "Oct 12 – 18" or "Sep 28 – Oct 4" */
export function formatWeekLabel(from: string, to: string) {
  const a = dayjs(from);
  const b = dayjs(to);
  return a.month() === b.month()
    ? `${a.format('MMM D')} – ${b.format('D')}`
    : `${a.format('MMM D')} – ${b.format('MMM D')}`;
}

/** "HH:mm" (or "HH:mm:ss") → "HH:mm:00"; empty → null. */
export function normalizeTime(time: string | null | undefined): string | null {
  const t = time?.trim();
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`;
}

type ScheduledRow = Pick<Tables<'scheduled_workouts'>, 'id' | 'user_id' | 'template_id' | 'notes'>;

/**
 * Moving a workout keeps the original row (status = 'rescheduled') and adds a
 * one-off occurrence that points back at it.
 */
export function buildReschedule(
  original: ScheduledRow,
  target: { date: string; time: string | null },
  timezone: string,
  newId: string = crypto.randomUUID(),
): {
  update: { status: 'rescheduled' };
  insert: TablesInsert<'scheduled_workouts'>;
} {
  const localTime = normalizeTime(target.time);
  return {
    update: { status: 'rescheduled' },
    insert: {
      id: newId,
      user_id: original.user_id,
      schedule_id: null,
      template_id: original.template_id,
      local_date: target.date,
      local_time: localTime,
      scheduled_at: localTime ? zonedToUtc(target.date, localTime, timezone) : null,
      is_rest: false,
      status: 'scheduled',
      rescheduled_from: original.id,
      notes: original.notes,
    },
  };
}

export type Rule = Pick<
  Tables<'workout_schedules'>,
  'id' | 'weekday' | 'template_id' | 'local_time' | 'active'
>;

/** 'none' = nothing planned, 'rest' = rest day, otherwise a template id. */
export type PlanChoice = 'none' | 'rest' | (string & {});

export type RuleChange =
  | { type: 'noop' }
  | { type: 'insert'; values: { weekday: number; template_id: string | null; local_time: string | null } }
  | { type: 'update'; id: string; patch: { template_id: string | null; local_time: string | null } }
  | { type: 'deactivate'; id: string };

export const ruleChoice = (rule: Rule | undefined): PlanChoice =>
  !rule ? 'none' : rule.template_id === null ? 'rest' : rule.template_id;

/** Turns a weekday choice into the write needed against workout_schedules. */
export function planRuleChange(
  weekday: number,
  existing: Rule | undefined,
  choice: PlanChoice,
  time: string | null,
): RuleChange {
  const active = existing?.active ? existing : undefined;
  if (choice === 'none') return active ? { type: 'deactivate', id: active.id } : { type: 'noop' };
  const template_id = choice === 'rest' ? null : choice;
  const local_time = choice === 'rest' ? null : normalizeTime(time);
  if (!active) return { type: 'insert', values: { weekday, template_id, local_time } };
  if (active.template_id === template_id && normalizeTime(active.local_time) === local_time)
    return { type: 'noop' };
  return { type: 'update', id: active.id, patch: { template_id, local_time } };
}

export type DayState = 'scheduled' | 'completed' | 'skipped' | 'rescheduled' | 'rest';

export const dayState = (row: Pick<Tables<'scheduled_workouts'>, 'status' | 'is_rest'>): DayState =>
  row.is_rest && row.status === 'rest' ? 'rest' : (row.status as DayState);
