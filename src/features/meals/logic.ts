import { dayjs, formatLocalTime, zonedToUtc } from '@/lib/time';
import type { Json, Tables, TablesInsert, TablesUpdate } from '@/types/database';

export type MealOccurrence = Tables<'meal_occurrences'>;
export type MealSchedule = Tables<'meal_schedules'>;

/** One literal line from the coach's plan, e.g. "6 oz chicken OR 99% lean ground turkey". */
export interface MealItem {
  text: string;
  optional?: boolean;
}

/** Reads the jsonb items list defensively (old rows, hand edits). */
export function parseItems(value: Json | null | undefined): MealItem[] {
  if (!Array.isArray(value)) return [];
  const items: MealItem[] = [];
  for (const raw of value) {
    if (typeof raw === 'string' && raw.trim()) items.push({ text: raw.trim() });
    else if (raw && typeof raw === 'object' && !Array.isArray(raw) && typeof raw.text === 'string') {
      const text = raw.text.trim();
      if (text) items.push(raw.optional === true ? { text, optional: true } : { text });
    }
  }
  return items;
}

/** Normalises editor rows for storage: trims, drops blanks, omits optional=false. */
export function serializeItems(items: MealItem[]): MealItem[] {
  return items
    .map((i) => ({ text: i.text.trim(), optional: !!i.optional }))
    .filter((i) => i.text.length > 0)
    .map((i) => (i.optional ? { text: i.text, optional: true } : { text: i.text }));
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type MealState = 'pending' | 'snoozed' | 'eaten' | 'skipped' | 'rescheduled';

export function mealState(
  o: Pick<MealOccurrence, 'status' | 'snoozed_until'>,
  now: Date = new Date(),
): MealState {
  if (o.status !== 'pending') return o.status;
  if (o.snoozed_until && dayjs(o.snoozed_until).isAfter(now)) return 'snoozed';
  return 'pending';
}

/** When the meal is due now: the snooze end if snoozed, otherwise its scheduled time. */
export function effectiveDueAt(o: Pick<MealOccurrence, 'scheduled_at' | 'snoozed_until'>): string {
  if (o.snoozed_until && dayjs(o.snoozed_until).isAfter(o.scheduled_at)) return o.snoozed_until;
  return o.scheduled_at;
}

export const formatInstant = (iso: string, tz: string) => dayjs(iso).tz(tz).format('h:mm A');

export function stateLabel(
  o: Pick<MealOccurrence, 'status' | 'snoozed_until' | 'completed_at'>,
  tz: string,
  now: Date = new Date(),
): string {
  switch (mealState(o, now)) {
    case 'eaten':
      return o.completed_at ? `Eaten at ${formatInstant(o.completed_at, tz)}` : 'Eaten';
    case 'skipped':
      return 'Skipped';
    case 'snoozed':
      return `Snoozed until ${formatInstant(o.snoozed_until!, tz)}`;
    case 'rescheduled':
      return 'Moved';
    default:
      return 'Pending';
  }
}

/** Visible meals for the day list (moved originals are shown as a small note instead). */
export const visibleMeals = (rows: MealOccurrence[]) => rows.filter((o) => o.status !== 'rescheduled');

/** A recently-due meal still counts as "up next" for this long. */
export const DUE_WINDOW_MINUTES = 60;

/**
 * The next pending meal: the earliest still-pending meal whose due time
 * (including snoozes) is no more than an hour ago. Older pending meals are left
 * alone rather than nagged about.
 */
export function nextUpcomingMeal<T extends MealOccurrence>(rows: T[], now: Date = new Date()): T | null {
  const cutoff = dayjs(now).subtract(DUE_WINDOW_MINUTES, 'minute');
  const candidates = rows
    .filter((o) => o.status === 'pending' && !dayjs(effectiveDueAt(o)).isBefore(cutoff))
    .sort((a, b) => dayjs(effectiveDueAt(a)).valueOf() - dayjs(effectiveDueAt(b)).valueOf());
  return candidates[0] ?? null;
}

// ---------------------------------------------------------------------------
// Mutation payloads (only columns the client may update)
// ---------------------------------------------------------------------------

export type OccurrencePatch = Pick<
  TablesUpdate<'meal_occurrences'>,
  'status' | 'completed_at' | 'snoozed_until' | 'notes'
>;

export const SNOOZE_OPTIONS = [15, 30, 60] as const;

export const snoozeUntil = (minutes: number, now: Date = new Date()) =>
  dayjs(now).add(minutes, 'minute').toISOString();

export const eatenPatch = (now: Date = new Date()): OccurrencePatch => ({
  status: 'eaten',
  completed_at: now.toISOString(),
  snoozed_until: null,
});
export const skipPatch = (): OccurrencePatch => ({
  status: 'skipped',
  completed_at: null,
  snoozed_until: null,
});
export const undoPatch = (): OccurrencePatch => ({
  status: 'pending',
  completed_at: null,
  snoozed_until: null,
});
export const snoozePatch = (minutes: number, now: Date = new Date()): OccurrencePatch => ({
  status: 'pending',
  snoozed_until: snoozeUntil(minutes, now),
});

/**
 * The display_order that slots a meal at `time` chronologically among a day's
 * meals (rows sort by display_order, then local_time).
 */
export function displayOrderFor(
  day: Pick<MealOccurrence, 'display_order' | 'local_time'>[],
  time: string,
): number {
  const t = normalizeTime(time);
  const sorted = [...day].sort(
    (a, b) => a.display_order - b.display_order || a.local_time.localeCompare(b.local_time),
  );
  if (sorted.length === 0) return 0;
  let order = sorted[0]!.display_order;
  for (const row of sorted) if (row.local_time <= t) order = row.display_order;
  return order;
}

/** 9:05 → 09:05:00 */
export function normalizeTime(time: string) {
  const [h = '0', m = '0', s = '0'] = time.split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:${s.padStart(2, '0')}`;
}

export interface RescheduleInput {
  id: string;
  userId: string;
  date: string;
  time: string;
  timezone: string;
  displayOrder: number;
}

/** The moved copy of a meal plus the patch that marks the original as moved. */
export function reschedulePayload(original: MealOccurrence, input: RescheduleInput) {
  const time = normalizeTime(input.time);
  const insert: TablesInsert<'meal_occurrences'> = {
    id: input.id,
    user_id: input.userId,
    schedule_id: null,
    rescheduled_from: original.id,
    local_date: input.date,
    local_time: time,
    scheduled_at: zonedToUtc(input.date, time, input.timezone),
    label_snapshot: original.label_snapshot,
    description_snapshot: original.description_snapshot,
    items_snapshot: original.items_snapshot,
    coach_note_snapshot: original.coach_note_snapshot,
    notes: original.notes,
    meal_number: original.meal_number,
    display_order: input.displayOrder,
    status: 'pending',
  };
  const originalPatch: TablesUpdate<'meal_occurrences'> = {
    status: 'rescheduled',
    completed_at: null,
    snoozed_until: null,
  };
  return { insert, originalPatch };
}

export interface AdHocInput {
  id: string;
  userId: string;
  label: string;
  description?: string | null;
  date: string;
  time: string;
  timezone: string;
  displayOrder: number;
}

export function adHocMealPayload(input: AdHocInput): TablesInsert<'meal_occurrences'> {
  const time = normalizeTime(input.time);
  return {
    id: input.id,
    user_id: input.userId,
    schedule_id: null,
    local_date: input.date,
    local_time: time,
    scheduled_at: zonedToUtc(input.date, time, input.timezone),
    label_snapshot: input.label.trim(),
    description_snapshot: input.description?.trim() || null,
    display_order: input.displayOrder,
    status: 'pending',
  };
}

/** "Moved to Tue 3:00 PM" for a rescheduled original, looking up its replacement. */
export function movedToLabel(original: MealOccurrence, all: MealOccurrence[], viewDate: string): string {
  const replacement = all.find((o) => o.rescheduled_from === original.id);
  if (!replacement) return 'moved';
  const time = formatLocalTime(replacement.local_time);
  return replacement.local_date === viewDate
    ? `moved to ${time}`
    : `moved to ${dayjs(replacement.local_date).format('ddd, MMM D')} ${time}`;
}

// ---------------------------------------------------------------------------
// Weekly plan
// ---------------------------------------------------------------------------

export const WEEKDAYS = [
  { value: 1, short: 'Mon', letter: 'M' },
  { value: 2, short: 'Tue', letter: 'T' },
  { value: 3, short: 'Wed', letter: 'W' },
  { value: 4, short: 'Thu', letter: 'T' },
  { value: 5, short: 'Fri', letter: 'F' },
  { value: 6, short: 'Sat', letter: 'S' },
  { value: 7, short: 'Sun', letter: 'S' },
] as const;

export function weekdaysLabel(days: number[]): string {
  const set = [...new Set(days)].sort((a, b) => a - b);
  if (set.length === 7) return 'Every day';
  if (set.join() === '1,2,3,4,5') return 'Weekdays';
  if (set.join() === '6,7') return 'Weekends';
  if (set.length === 6) {
    const missing = WEEKDAYS.find((d) => !set.includes(d.value))!;
    return `Every day except ${missing.short}`;
  }
  return set.map((d) => WEEKDAYS[d - 1]!.short).join(', ');
}

export interface ScheduleFormValues {
  label: string;
  meal_number: number | '';
  description: string;
  items: { key: string; text: string; optional: boolean }[];
  coach_note: string;
  notes: string;
  local_time: string;
  recurrence_weekdays: string[];
  active: boolean;
  display_order: number | '';
  needs_confirmation: boolean;
  confirmation_note: string;
}

const blankToNull = (v: string) => (v.trim() ? v.trim() : null);

/** Editor values → granted meal_schedules columns. */
export function scheduleFromForm(v: ScheduleFormValues) {
  return {
    label: v.label.trim(),
    meal_number: v.meal_number === '' ? null : v.meal_number,
    description: blankToNull(v.description),
    items: serializeItems(v.items) as unknown as Json,
    coach_note: blankToNull(v.coach_note),
    notes: blankToNull(v.notes),
    local_time: normalizeTime(v.local_time),
    recurrence_weekdays: v.recurrence_weekdays.map(Number).sort((a, b) => a - b),
    active: v.active,
    display_order: v.display_order === '' ? 0 : v.display_order,
    needs_confirmation: v.needs_confirmation,
    confirmation_note: v.needs_confirmation ? blankToNull(v.confirmation_note) : null,
  } satisfies TablesUpdate<'meal_schedules'>;
}

export type SchedulePatch = ReturnType<typeof scheduleFromForm>;

export function scheduleToForm(
  s: MealSchedule | null,
  keyGen: () => string = () => crypto.randomUUID(),
): ScheduleFormValues {
  return {
    label: s?.label ?? '',
    meal_number: s?.meal_number ?? '',
    description: s?.description ?? '',
    items: parseItems(s?.items).map((i) => ({ key: keyGen(), text: i.text, optional: !!i.optional })),
    coach_note: s?.coach_note ?? '',
    notes: s?.notes ?? '',
    local_time: s ? s.local_time.slice(0, 5) : '12:00',
    recurrence_weekdays: (s?.recurrence_weekdays ?? [1, 2, 3, 4, 5, 6, 7]).map(String),
    active: s?.active ?? true,
    display_order: s?.display_order ?? '',
    needs_confirmation: s?.needs_confirmation ?? false,
    confirmation_note: s?.confirmation_note ?? '',
  };
}

/** A copy of a schedule as a new insert (the import key stays with the original). */
export function duplicateSchedule(
  s: MealSchedule,
  id: string,
  userId: string,
): TablesInsert<'meal_schedules'> {
  const suffix = ' (copy)';
  return {
    id,
    user_id: userId,
    label: `${s.label.slice(0, 40 - suffix.length)}${suffix}`,
    description: s.description,
    notes: s.notes,
    local_time: s.local_time,
    recurrence_weekdays: s.recurrence_weekdays,
    active: s.active,
    meal_number: s.meal_number,
    display_order: s.display_order,
    items: s.items,
    coach_note: s.coach_note,
    relative_event: s.relative_event,
    relative_offset_minutes: s.relative_offset_minutes,
    needs_confirmation: s.needs_confirmation,
    confirmation_note: s.confirmation_note,
  };
}

/** Next display_order for a new schedule (after the last one). */
export const nextDisplayOrder = (schedules: Pick<MealSchedule, 'display_order'>[]) =>
  schedules.reduce((max, s) => Math.max(max, s.display_order), 0) + 1;

/** The next quarter hour in `tz` as HH:mm (a sensible default when picking a time). */
export function nextQuarterHour(tz: string, now: Date = new Date()): string {
  const local = dayjs(now).tz(tz);
  const minutes = local.hour() * 60 + local.minute();
  const next = Math.min(23 * 60 + 45, Math.ceil((minutes + 1) / 15) * 15);
  return `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export type MealSection = 'today' | 'plan' | 'water';
const SECTIONS: MealSection[] = ['today', 'plan', 'water'];

/** `/meals`, `/meals/:section` and `?tab=water` (links from notifications). */
export function resolveSection(param: string | undefined, tab: string | null): MealSection {
  if (tab && (SECTIONS as string[]).includes(tab)) return tab as MealSection;
  return param && (SECTIONS as string[]).includes(param) ? (param as MealSection) : 'today';
}

/** Today / Tomorrow / Yesterday / Wed, Oct 21 */
export function dayTitle(date: string, today: string) {
  const diff = dayjs(date).diff(dayjs(today), 'day');
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return dayjs(date).format('ddd, MMM D');
}
